declare module "adbkit-apkreader" {
  /** Minimal typing for the parts of adbkit-apkreader we use. */
  interface Permission {
    name: string;
  }

  interface Component {
    name: string;
    exported?: boolean;
    permission?: string;
    intentFilters?: Array<unknown>;
  }

  interface Application {
    label?: string;
    icon?: string;
    activities?: Component[];
    services?: Component[];
    receivers?: Component[];
    providers?: Component[];
  }

  interface Manifest {
    package: string;
    versionCode: number;
    versionName: string;
    usesSdk?: { minSdkVersion?: number; targetSdkVersion?: number };
    usesPermissions?: Permission[];
    application?: Application;
  }

  export default class ApkReader {
    static open(filepath: string): Promise<ApkReader>;
    readManifest(): Promise<Manifest>;
    readContent(file: string): Promise<Buffer>;
    usingPaths(): Promise<string[]>;
  }
}
