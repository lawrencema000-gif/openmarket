import { describe, it, expect } from "vitest";
import {
  computeDataSafetyDiscrepancies,
  type DataSafetyDeclaration,
} from "../data-safety";

const NO_DECLARATION = null;

const EMPTY_DECLARATION: DataSafetyDeclaration = {
  collectsData: false,
  sharesData: false,
  dataEncryptedInTransit: false,
  dataTypes: {},
};

describe("computeDataSafetyDiscrepancies", () => {
  it("no permissions + no declaration → no discrepancies", () => {
    expect(computeDataSafetyDiscrepancies([], null)).toEqual([]);
  });

  it("permissions but no declaration → one discrepancy per mapped permission", () => {
    const out = computeDataSafetyDiscrepancies(
      [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.CAMERA",
      ],
      NO_DECLARATION,
    );
    expect(out).toHaveLength(2);
    expect(out.map((d) => d.permission).sort()).toEqual([
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.CAMERA",
    ]);
  });

  it("permission with no mapped data type is skipped (we don't flag what we can't model)", () => {
    const out = computeDataSafetyDiscrepancies(
      ["android.permission.INTERNET", "android.permission.VIBRATE"],
      NO_DECLARATION,
    );
    expect(out).toEqual([]);
  });

  it("collectsData=false + dangerous permission → every mapped type is missing", () => {
    const out = computeDataSafetyDiscrepancies(
      ["android.permission.READ_CONTACTS"],
      EMPTY_DECLARATION,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.missingFromDeclaration).toContain("contacts");
  });

  it("permission present + matching category declared collected → no discrepancy", () => {
    const declaration: DataSafetyDeclaration = {
      collectsData: true,
      sharesData: false,
      dataEncryptedInTransit: false,
      dataTypes: {
        location_precise: {
          collected: true,
          shared: false,
          optional: false,
          purposes: ["app_functionality"],
        },
      },
    };
    const out = computeDataSafetyDiscrepancies(
      ["android.permission.ACCESS_FINE_LOCATION"],
      declaration,
    );
    expect(out).toEqual([]);
  });

  it("permission present + matching category marked NOT collected → discrepancy", () => {
    const declaration: DataSafetyDeclaration = {
      collectsData: true,
      sharesData: false,
      dataEncryptedInTransit: false,
      dataTypes: {
        location_precise: {
          collected: false, // says "no" but APK has the perm
          shared: false,
          optional: false,
          purposes: [],
        },
      },
    };
    const out = computeDataSafetyDiscrepancies(
      ["android.permission.ACCESS_FINE_LOCATION"],
      declaration,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.missingFromDeclaration).toEqual(["location_precise"]);
  });

  it("READ_PHONE_STATE expects both phone + device_id; partial declaration surfaces the missing one only", () => {
    const declaration: DataSafetyDeclaration = {
      collectsData: true,
      sharesData: false,
      dataEncryptedInTransit: false,
      dataTypes: {
        phone: {
          collected: true,
          shared: false,
          optional: false,
          purposes: [],
        },
        device_id: {
          collected: false, // missing
          shared: false,
          optional: false,
          purposes: [],
        },
      },
    };
    const out = computeDataSafetyDiscrepancies(
      ["android.permission.READ_PHONE_STATE"],
      declaration,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.missingFromDeclaration).toEqual(["device_id"]);
  });

  it("permission listed multiple times still emits one discrepancy per occurrence (caller dedupes upstream if needed)", () => {
    const out = computeDataSafetyDiscrepancies(
      [
        "android.permission.CAMERA",
        "android.permission.CAMERA",
      ],
      NO_DECLARATION,
    );
    expect(out).toHaveLength(2);
  });
});
