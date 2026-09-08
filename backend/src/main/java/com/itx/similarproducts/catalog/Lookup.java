package com.itx.similarproducts.catalog;

/**
 * The outcome of looking something up in the existing API.
 *
 * <p>It is modelled as a sealed type rather than returning {@code null} or throwing, because there
 * are <b>three</b> outcomes with different consequences and the caller should not be able to
 * conflate them:
 *
 * <ul>
 *   <li>{@link Found}: it is there.
 *   <li>{@link Missing}: the API answers 404. That is a legitimate and stable answer, so it can be
 *       remembered for a while: it is not going to appear out of nowhere.
 *   <li>{@link Unavailable}: the call failed or took too long. That is a transient state, so it is
 *       remembered for a few seconds only and then retried.
 * </ul>
 *
 * <p>That distinction is what allows giving each case its own cache expiry, and <b>caching a
 * failure at all</b>. A loader that throws leaves nothing behind: Caffeine discards a failed
 * future, so the next caller starts from scratch. Returning the outcome as a value means even
 * "this does not exist" is remembered, which is the difference between one call to the source and
 * one per request received.
 *
 * <p>It is generic because both lookups need it: a product detail and a list of similar
 * identifiers want the same policy, and writing it twice would let the two drift apart.
 */
public sealed interface Lookup<T> {

    record Found<T>(T value) implements Lookup<T> {
    }

    record Missing<T>() implements Lookup<T> {
    }

    record Unavailable<T>() implements Lookup<T> {
    }
}
