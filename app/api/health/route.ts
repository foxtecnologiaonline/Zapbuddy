import { getHealthStatus } from '../../../src/health/get-health-status';

export async function GET(): Promise<Response> {
  const health = await getHealthStatus();

  return Response.json(health, { status: health.status === 'ok' ? 200 : 503 });
}
