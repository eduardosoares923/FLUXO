// Permissões por módulo (o que cada pessoa enxerga e pode editar no menu do app).
// O formato é o mesmo que o app já lia do cadastro: { modulo: ['view', 'edit'] }.

export type PermissionMap = Record<string, string[]>;

// Módulos do dia a dia (não inclui Configurações nem Usuários, que ficam só pra admin
// ou pra quem receber essas permissões explicitamente no cadastro).
const FULL_ACCESS: PermissionMap = {
  transactions: ['view', 'edit'],
  accounts: ['view', 'edit'],
  cards: ['view', 'edit'],
  subscriptions: ['view', 'edit'],
  reports: ['view'],
};

const READ_ONLY: PermissionMap = {
  transactions: ['view'],
  accounts: ['view'],
  cards: ['view'],
  subscriptions: ['view'],
  reports: ['view'],
};

// Permissões padrão por cargo, usadas quando o cadastro da pessoa não define "permissions".
// Antes disso, nenhuma tela gravava esse campo, então todo usuário que não era admin
// ficava com permissões vazias e só via o Painel no menu.
export function defaultPermissionsFor(role?: string): PermissionMap {
  if (role === 'viewer') return cloneMap(READ_ONLY);
  if (role === 'usuario' || role === 'gerente') return cloneMap(FULL_ACCESS);
  return {};
}

// Se o cadastro tiver "permissions" preenchido, ele manda (dá pra restringir ou ampliar
// pessoa a pessoa). Se estiver vazio ou ausente, vale o padrão do cargo.
export function resolvePermissions(role: string | undefined, stored: unknown): PermissionMap {
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && Object.keys(stored as object).length > 0) {
    return stored as PermissionMap;
  }
  return defaultPermissionsFor(role);
}

function cloneMap(map: PermissionMap): PermissionMap {
  const copy: PermissionMap = {};
  for (const key of Object.keys(map)) copy[key] = [...map[key]];
  return copy;
}
