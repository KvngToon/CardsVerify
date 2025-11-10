/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    runtime: {
      env: {
        RESEND_API_KEY?: string;
        SESSION?: KVNamespace;
      };
    };
  }
}
