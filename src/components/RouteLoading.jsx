export function RouteLoading() {
  return (
    <div
      className="route-loading-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px',
        padding: '3rem',
        color: '#94a3b8',
        gap: '1rem',
      }}
    >
      <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '2rem', color: '#3b82f6' }} />
      <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>Carregando módulo...</span>
    </div>
  );
}
export default RouteLoading;
