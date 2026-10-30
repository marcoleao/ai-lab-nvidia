/** Presentation only: technical IDs, command bodies and recorded content stay intact. */
export const specificationGateway = 'Gateway de Especificação';
export function gatewayText(value?: string | null): string {
  return (value || '').replace(/\bG1\b/g, specificationGateway);
}
