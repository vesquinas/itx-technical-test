package com.itx.similarproducts.catalog;

/**
 * The outcome of looking something up in the existing API: it is there, it is not, or we could not
 * ask.
 *
 * <p>Three outcomes rather than a {@code null} or an exception, because each one deserves a
 * different cache expiry: a 404 is a stable answer worth remembering for a while, a failure is
 * transient and worth remembering for seconds. That is also why the outcome is a <b>value</b>: a
 * loader that throws leaves no cache entry, so an outcome that is thrown cannot be remembered.
 *
 * <p>It is generic because both lookups need the same policy, and writing it twice is how the two
 * of them drifted apart in the first place.
 */
public sealed interface Lookup<T> {

    /** It is there. */
    record Found<T>(T value) implements Lookup<T> {
    }

    /** The API answered 404. */
    record Missing<T>() implements Lookup<T> {
    }

    /** The call failed or took too long. */
    record Unavailable<T>() implements Lookup<T> {
    }
}
