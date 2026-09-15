export function wireLogoutButton(button, logout) {
  button?.addEventListener('click', () => logout());
}
