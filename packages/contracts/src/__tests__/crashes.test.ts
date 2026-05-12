import { describe, it, expect } from "vitest";
import { computeFingerprint, crashSubmissionSchema } from "../crashes";

// Tiny deterministic hash for the unit tests — the real Node-side
// helper uses SHA-256, but the algorithm contract is what we're
// verifying here (normalized + framework-stripped), not the hash
// function itself.
function fakeHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return `h${h >>> 0}`;
}

describe("computeFingerprint", () => {
  const baseStack = `java.lang.NullPointerException: Attempt to invoke virtual method
\tat com.example.app.MainActivity.onCreate(MainActivity.kt:42)
\tat com.example.app.MainActivity.access$0(MainActivity.kt:1)
\tat android.app.Activity.performCreate(Activity.java:7234)
\tat androidx.appcompat.app.AppCompatActivity.onCreate(AppCompatActivity.java:99)`;

  it("produces a stable fingerprint for the same stack", () => {
    const a = computeFingerprint("NPE", baseStack, fakeHash);
    const b = computeFingerprint("NPE", baseStack, fakeHash);
    expect(a).toBe(b);
  });

  it("is insensitive to source line numbers", () => {
    const stripped = baseStack.replace(":42", ":99").replace(":7234", ":1");
    const a = computeFingerprint("NPE", baseStack, fakeHash);
    const b = computeFingerprint("NPE", stripped, fakeHash);
    expect(a).toBe(b);
  });

  it("groups the same bug across releases", () => {
    // Same logical frame, different file:line.
    const v1 = `at com.example.app.MainActivity.onCreate(MainActivity.kt:42)`;
    const v2 = `at com.example.app.MainActivity.onCreate(MainActivity.kt:78)`;
    expect(
      computeFingerprint("NPE", v1, fakeHash),
    ).toBe(computeFingerprint("NPE", v2, fakeHash));
  });

  it("uses different fingerprints for genuinely different crashes", () => {
    const other = baseStack.replace(
      "com.example.app.MainActivity.onCreate",
      "com.example.app.SettingsActivity.onPause",
    );
    expect(
      computeFingerprint("NPE", baseStack, fakeHash),
    ).not.toBe(computeFingerprint("NPE", other, fakeHash));
  });

  it("strips Android framework frames before grouping", () => {
    // Only the framework frames differ — should match.
    const stackA = `${baseStack}\n\tat android.os.Handler.dispatchMessage(Handler.java:1)`;
    const stackB = `${baseStack}\n\tat android.os.Handler.handleCallback(Handler.java:1)`;
    expect(
      computeFingerprint("NPE", stackA, fakeHash),
    ).toBe(computeFingerprint("NPE", stackB, fakeHash));
  });

  it("includes the exception type in the fingerprint", () => {
    const a = computeFingerprint("NPE", baseStack, fakeHash);
    const b = computeFingerprint("OOM", baseStack, fakeHash);
    expect(a).not.toBe(b);
  });
});

describe("crashSubmissionSchema", () => {
  it("requires exceptionType and stackTrace", () => {
    expect(() => crashSubmissionSchema.parse({})).toThrow();
    expect(() =>
      crashSubmissionSchema.parse({ exceptionType: "x" }),
    ).toThrow();
    expect(() =>
      crashSubmissionSchema.parse({ stackTrace: "y" }),
    ).toThrow();
  });

  it("accepts the minimal valid shape", () => {
    const parsed = crashSubmissionSchema.parse({
      exceptionType: "NPE",
      stackTrace: "at A.foo",
    });
    expect(parsed.exceptionType).toBe("NPE");
  });

  it("rejects oversized payloads", () => {
    expect(() =>
      crashSubmissionSchema.parse({
        exceptionType: "NPE",
        stackTrace: "a".repeat(50001),
      }),
    ).toThrow();
  });
});
