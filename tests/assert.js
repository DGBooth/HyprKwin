// Minimal assertions so the tests need no network access to run.
function eq(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function assertEquals(actual, expected, msg) {
    if (!eq(actual, expected)) {
        throw new Error((msg ? msg + ": " : "") + "expected " + JSON.stringify(expected) + " but got " + JSON.stringify(actual));
    }
}

export function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
}
