import { describe, expect, it } from "vitest";

import { transformXmlLayoutToHtml } from "#/services/ui-preview/xml-layout-transform";

const ANDROID_HEADER = `<?xml version="1.0" encoding="utf-8"?>`;

describe("transformXmlLayoutToHtml", () => {
  it("renders a LinearLayout with its orientation as a flex container", () => {
    const { html, warnings } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:orientation="vertical" />`,
    );

    expect(html).toContain('data-android-type="LinearLayout"');
    expect(html).toContain("flex-direction:column");
    expect(warnings).toEqual([]);
  });

  it("resolves @string references from the provided values map", () => {
    const { html } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <TextView android:text="@string/greeting" />
</LinearLayout>`,
      { strings: { greeting: "Hello there" } },
    );

    expect(html).toContain("Hello there");
    expect(html).not.toContain("@string/greeting");
  });

  it("reports an unresolved @string reference as a warning and keeps the ref visible", () => {
    const { html, warnings } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <TextView android:text="@string/missing" />
</LinearLayout>`,
    );

    expect(html).toContain("@string/missing");
    expect(warnings.some((w) => w.includes("@string/missing"))).toBe(true);
  });

  it("maps a Button to a non-interactive button element", () => {
    const { html } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <Button android:text="Submit" />
</LinearLayout>`,
    );

    expect(html).toContain("<button");
    expect(html).toContain("disabled");
    expect(html).toContain("Submit");
  });

  it("renders an EditText as a disabled input carrying its hint", () => {
    const { html } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <EditText android:hint="Email" />
</LinearLayout>`,
    );

    expect(html).toContain("<input");
    expect(html).toContain('placeholder="Email"');
  });

  it("shows an unknown node as a labelled placeholder instead of dropping it", () => {
    const { html, warnings } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <MyCustomWidget android:id="@+id/thing" />
</LinearLayout>`,
    );

    expect(html).toContain("MyCustomWidget");
    expect(warnings.some((w) => w.includes("MyCustomWidget"))).toBe(true);
  });

  it("escapes markup so layout text cannot inject HTML", () => {
    const { html } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <TextView android:text="&lt;script&gt;alert(1)&lt;/script&gt;" />
</LinearLayout>`,
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("falls back to a readable message when the XML is not well-formed", () => {
    const { html, warnings } = transformXmlLayoutToHtml("<LinearLayout><oops>");

    expect(warnings.some((w) => /not well-formed/i.test(w))).toBe(true);
    expect(html).toContain("LinearLayout");
  });

  it("applies match_parent width as a full-width box", () => {
    const { html } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent" android:layout_height="wrap_content" />`,
    );

    expect(html).toContain("width:100%");
  });

  it("renders a RecyclerView as a runtime-items placeholder", () => {
    const { html } = transformXmlLayoutToHtml(
      `${ANDROID_HEADER}
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android">
  <RecyclerView android:id="@+id/list" />
</LinearLayout>`,
    );

    expect(html.toLowerCase()).toContain("recyclerview");
  });
});
