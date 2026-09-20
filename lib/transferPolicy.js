/**
 * Política de activación tras transferencia bancaria.
 *
 * Por defecto, al confirmar el cliente se aprueba el pago y el pedido
 * entra a búsqueda / muro. Para exigir OK manual del admin:
 *   REQUIRE_TRANSFER_ADMIN_APPROVAL=true
 */
function shouldAutoApproveClientTransfer() {
  const requireAdmin = String(process.env.REQUIRE_TRANSFER_ADMIN_APPROVAL || '').trim().toLowerCase();
  if (requireAdmin === '1' || requireAdmin === 'true' || requireAdmin === 'yes') return false;
  const forceAuto = String(process.env.AUTO_APPROVE_TRANSFERS || '').trim().toLowerCase();
  if (forceAuto === '1' || forceAuto === 'true' || forceAuto === 'yes') return true;
  if (forceAuto === '0' || forceAuto === 'false' || forceAuto === 'no') return false;
  return true;
}

module.exports = {
  shouldAutoApproveClientTransfer
};
