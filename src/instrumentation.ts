/**
 * OpenTelemetry bootstrap for traces + Pino log correlation.
 * Must be imported before any module that loads `pino` (see `./utils/logger`).
 */
import dotenv from 'dotenv';

dotenv.config();

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

const serviceName = process.env.OTEL_SERVICE_NAME || 'loyalty-program';

const sdkDisabled =
  process.env.OTEL_SDK_DISABLED === 'true' || process.env.OTEL_SDK_DISABLED === '1';

const hasOtlpEndpoint = Boolean(
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT
);

let sdk: NodeSDK | undefined;

if (!sdkDisabled && hasOtlpEndpoint) {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  const traceExporter = new OTLPTraceExporter();

  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PinoInstrumentation(),
    ],
  });

  sdk.start();
}

const shutdown = async () => {
  if (sdk) {
    await sdk.shutdown().catch(() => undefined);
  }
};

process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
