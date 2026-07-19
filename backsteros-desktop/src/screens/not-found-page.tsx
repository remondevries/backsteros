import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="inbox-detail-layout">
      <div className="inbox-detail-empty">
        <p>Page not found.</p>
        <p style={{ marginTop: 8 }}>
          <Link to="/projects">Back to projects</Link>
        </p>
      </div>
    </div>
  );
}
