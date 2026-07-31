import { Container, getContainer } from "@cloudflare/containers";

/**
 * Single-tenant BKoAb app container.
 * Routes all HTTP traffic to the FastAPI process inside the container.
 */
export class BkoabContainer extends Container {
  defaultPort = 8000;
  sleepAfter = "30m";
  enableInternet = true;
  pingEndpoint = "/health";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // One shared instance for this personal app
    const container = getContainer(env.BKOAB_CONTAINER, "default");
    return container.fetch(request);
  },
};

interface Env {
  BKOAB_CONTAINER: DurableObjectNamespace<BkoabContainer>;
}
