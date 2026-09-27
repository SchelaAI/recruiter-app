export default function AppLoading() {
  return (
    <div className="page-wrap" aria-busy="true" aria-label="Loading Schela">
      <div className="loading-heading" />
      <div className="metric-grid">
        {Array.from({ length: 4 }).map((_, index) => <div className="loading-card" key={index} />)}
      </div>
      <div className="loading-panel" />
    </div>
  );
}
