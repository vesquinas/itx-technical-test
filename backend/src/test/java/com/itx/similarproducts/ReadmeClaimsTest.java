package com.itx.similarproducts;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Checks that what the README claims is true.
 *
 * <p>It exists because of the one reservation an external review kept after everything else was
 * fixed: the first version of this project documented as <i>done</i> three things that were not,
 * all three in its most extensively written sections, and <b>the corrections happened because a
 * person read it rather than because any mechanism would have caught them</b>. The rule it asked
 * for is the rule here: no claim in a README without a command that proves it.
 *
 * <p>Behaviour is proved by the rest of this suite. The numbers are proved here, because numbers
 * are what rot in silence: a test added today leaves the README wrong tomorrow and nothing
 * complains. It is a plain unit test on purpose — it needs no Spring context, only the files.
 *
 * <p>What it cannot do is notice a new sentence asserting something unverified: no script tells
 * prose from a claim. That is why the README carries a table pairing each substantive claim with
 * the command that proves it, and why the gap is stated there rather than pretended away.
 */
class ReadmeClaimsTest {

    private static final Path README = Path.of("README.md");
    private static final Path CONFIGURATION = Path.of("src/main/resources/application.yaml");
    private static final Path MAIN = Path.of("src/main/java");
    private static final Path TESTS = Path.of("src/test/java");

    private static String read(Path path) throws IOException {
        return Files.readString(path);
    }

    /** The single value a pattern captures, so a missing claim fails loudly rather than silently. */
    private static String captured(String text, String pattern) {
        Matcher matcher = Pattern.compile(pattern, Pattern.MULTILINE).matcher(text);
        assertThat(matcher.find())
                .as("nothing matches this pattern any more: %s", pattern)
                .isTrue();
        return matcher.group(1);
    }

    @Test
    void the_stated_number_of_tests_is_the_number_there_are() throws IOException {
        long actual;
        try (Stream<Path> files = Files.walk(TESTS)) {
            actual = files
                    .filter(path -> path.toString().endsWith(".java"))
                    .mapToLong(path -> {
                        try {
                            // Counting the annotation rather than the methods: @ParameterizedTest
                            // contributes several executions from one method, and what the README
                            // states is what Maven reports.
                            return Pattern.compile("^\\s*@(Test|ParameterizedTest)\\b", Pattern.MULTILINE)
                                    .matcher(Files.readString(path))
                                    .results()
                                    .count();
                        } catch (IOException e) {
                            throw new AssertionError(e);
                        }
                    })
                    .sum();
        }

        // The parameterised tests run more than once each, so the total Maven reports is higher
        // than the number of methods. The claim has to be at least the methods and cannot be wild.
        long claimed = Long.parseLong(captured(read(README), "^(\\d+) tests\\."));
        assertThat(claimed)
                .as("the README says %s tests and there are %s test methods", claimed, actual)
                .isBetween(actual, actual + 12);
    }

    @Test
    void the_ports_in_the_readme_are_the_ports_configured() throws IOException {
        String configuration = read(CONFIGURATION);
        String readme = read(README);

        assertThat(captured(configuration, "^  port: (\\d+)")).isEqualTo("5000");
        assertThat(captured(configuration, "^    port: (\\d+)")).isEqualTo("5001");
        assertThat(readme).contains("on port 5000").contains("5001");
    }

    @Test
    void the_expiries_and_the_budget_in_the_readme_are_the_ones_configured() throws IOException {
        String configuration = read(CONFIGURATION);
        String readme = read(README);

        // Each of these numbers is defended in the README with a measurement. If one changes, the
        // reasoning printed next to it stops being true, which is what this asserts.
        assertThat(captured(configuration, "success-ttl: (\\S+)")).isEqualTo("5m");
        assertThat(captured(configuration, "missing-ttl: (\\S+)")).isEqualTo("1m");
        assertThat(captured(configuration, "unavailable-ttl: (\\S+)")).isEqualTo("10s");
        assertThat(captured(configuration, "fan-out-timeout: (\\S+)")).isEqualTo("600ms");
        assertThat(captured(configuration, "max-similar-products: (\\d+)")).isEqualTo("50");

        assertThat(readme)
                .as("the expiry table")
                .contains("| `Found` | 5 min |")
                .contains("| `Missing` (404) | 1 min |")
                .contains("| `Unavailable` (failure or timeout) | 10 s |");
        assertThat(readme).contains("600 ms budget").contains("50 by default");
    }

    @Test
    void the_readme_documents_every_endpoint_the_service_exposes() throws IOException {
        List<String> mapped;
        try (Stream<Path> files = Files.walk(MAIN)) {
            mapped = files
                    .filter(path -> path.toString().endsWith(".java"))
                    .flatMap(path -> {
                        try {
                            return Pattern.compile("@GetMapping\\(\"([^\"]+)\"\\)")
                                    .matcher(Files.readString(path))
                                    .results()
                                    .map(result -> result.group(1));
                        } catch (IOException e) {
                            throw new AssertionError(e);
                        }
                    })
                    .toList();
        }

        assertThat(mapped).isNotEmpty();
        String readme = read(README);
        for (String endpoint : mapped) {
            assertThat(readme)
                    .as("the endpoint %s is not in the README's table", endpoint)
                    .contains(endpoint);
        }
    }

    @Test
    void the_name_of_the_completeness_header_matches_what_the_readme_documents() throws IOException {
        String controller = read(MAIN.resolve("com/itx/similarproducts/web/SimilarProductsController.java"));
        String header = captured(controller, "COMPLETE_HEADER = \"([^\"]+)\"");

        assertThat(read(README))
                .as("a client reads this name out of the README")
                .contains(header);
    }

    @Test
    void the_comment_density_the_readme_states_is_the_current_one() throws IOException {
        double main = density(MAIN);
        double tests = density(TESTS);

        int claimedMain = Integer.parseInt(
                captured(read(README), "\\*\\*(\\d+)% of the lines of `src/main`\\*\\*"));
        int claimedTests = Integer.parseInt(
                captured(read(README), "and (\\d+)% of the tests"));

        // A point of tolerance: the README states whole numbers, and a couple of lines either way
        // should not fail a build. Three points of drift should.
        assertThat((double) claimedMain)
                .as("density of src/main is %.1f%%", main)
                .isCloseTo(main, org.assertj.core.data.Offset.offset(1.0));
        assertThat((double) claimedTests)
                .as("density of the tests is %.1f%%", tests)
                .isCloseTo(tests, org.assertj.core.data.Offset.offset(1.0));
    }

    private static double density(Path root) throws IOException {
        long comments = 0;
        long lines = 0;
        try (Stream<Path> files = Files.walk(root)) {
            for (Path path : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                for (String raw : Files.readAllLines(path)) {
                    String line = raw.strip();
                    if (line.isEmpty()) {
                        continue;
                    }
                    lines++;
                    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) {
                        comments++;
                    }
                }
            }
        }
        return (100.0 * comments) / lines;
    }

    @Test
    void the_performance_table_is_transcribed_from_the_committed_measurements() throws IOException {
        String readme = read(README);

        // The strongest thing that *can* be guarded about a measurement: not that it is recent —
        // no test knows that — but that the prose has not drifted from the artefact the tool
        // produced. The two files hold the raw k6 output of the two runs the table compares.
        for (String artefact : List.of("k6-600ms-budget.txt", "k6-1500ms-budget.txt")) {
            String output = read(Path.of("measurements", artefact));

            String requests = captured(output, "http_reqs\\.+: (\\d+)");
            // Two spaces separate the count from the rate in k6's output, hence `\\s+`. It is
            // rounded rather than truncated, because that is what the table does: k6 prints
            // 269.257828/s and rounding to two places gives 269.26, not 269.25.
            String rate = new BigDecimal(captured(output, "http_reqs\\.+: \\d+\\s+(\\d+\\.\\d+)"))
                    .setScale(2, RoundingMode.HALF_UP)
                    .toPlainString();
            // Anchored to the duration line: k6 prints `avg=` on half a dozen metrics, and reading
            // the first one gave the connection-blocking time. That was this test's second bug.
            String durations = captured(output, "http_req_duration\\.+: (.+)");
            String mean = captured(durations, "avg=(\\S+?)(?=\\s|$)");
            String median = captured(durations, "med=(\\S+?)(?=\\s|$)");
            String ninetieth = captured(durations, "p\\(90\\)=(\\S+?)(?=\\s|$)");
            String ninetyFifth = captured(durations, "p\\(95\\)=(\\S+?)(?=\\s|$)");
            String worst = captured(durations, "max=(\\S+?)(?=\\s|$)");

            assertThat(readme)
                    .as("%s: every figure of this run has to appear in the table", artefact)
                    .contains(requests, rate, mean, median, ninetieth, ninetyFifth, worst);
        }
    }

    @Test
    void the_performance_figures_say_where_they_came_from() throws IOException {
        String readme = read(README);

        // These are the only numbers here that no test can gate: a throughput asserted in
        // continuous integration would fail on a smaller runner and would say nothing about the
        // code. A review made the point by falsifying 285.2/s to 985.2/s and watching this suite
        // pass. What can be required is that they never appear without saying how they were
        // produced — the command, and the day.
        assertThat(readme)
                .as("the command that reproduces the measurements")
                .contains("docker compose run --rm k6 run scripts/test.js");
        assertThat(readme)
                .as("the day they were measured, so a reader can tell how old they are")
                .containsPattern("Measured on \\*\\*\\d{4}-\\d{2}-\\d{2}\\*\\*");
        assertThat(readme)
                .as("and that they are not presented as a property of the code")
                .contains("a measurement, not a property");

        // The tables themselves: every throughput figure has to live in the section that carries
        // that provenance, so a new one cannot be added somewhere it is unexplained.
        String provenanceSection = readme.substring(readme.indexOf("Where these numbers come from"));
        // The negative lookahead matters: without it this matched the "1/s" of
        // `/product/1/similar`, which was this test's own first bug.
        List<String> throughputs = Pattern.compile("\\d+(?:[.,]\\d+)?/s(?![a-zA-Z])")
                .matcher(readme)
                .results()
                .map(MatchResult -> MatchResult.group())
                .toList();
        assertThat(throughputs).as("there are throughput figures to check").isNotEmpty();
        for (String figure : throughputs) {
            assertThat(provenanceSection)
                    .as("the figure %s appears before the paragraph that explains where it came from", figure)
                    .contains(figure);
        }
    }

    @Test
    void every_internal_link_of_the_readme_points_at_a_section_that_exists() throws IOException {
        String readme = read(README);

        // GitHub's own slugs: lower-cased, punctuation dropped, spaces turned into hyphens. A
        // renamed section leaves a link that silently goes nowhere, which is the same class of rot
        // as a number that no longer matches.
        Set<String> sections = Pattern.compile("^#{1,6}\\s+(.+)$", Pattern.MULTILINE)
                .matcher(readme)
                .results()
                .map(result -> result.group(1)
                        .toLowerCase(Locale.ROOT)
                        .replaceAll("[`*\\[\\]()]", "")
                        .replaceAll("[^\\w\\s-]", "")
                        .strip()
                        // Each space becomes a hyphen, not each run of them: GitHub leaves the
                        // double hyphen that an em dash surrounded by spaces produces. Collapsing
                        // them was this test's first bug.
                        .replaceAll("\\s", "-"))
                .collect(Collectors.toSet());

        List<String> broken = Pattern.compile("\\[([^\\]]+)\\]\\(#([^)]+)\\)")
                .matcher(readme)
                .results()
                .filter(result -> !sections.contains(result.group(2)))
                .map(result -> result.group(1) + " -> #" + result.group(2))
                .toList();

        assertThat(broken).as("internal links pointing nowhere").isEmpty();
    }

    @Test
    void the_java_version_the_readme_requires_is_the_one_the_build_targets() throws IOException {
        String pom = read(Path.of("pom.xml"));

        assertThat(captured(pom, "<java.version>(\\d+)</java.version>")).isEqualTo("21");
        assertThat(read(README)).contains("Requires Java 21");
    }
}
