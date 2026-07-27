export function ComingSoonSettingsSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="settings-card settings-coming-soon-card">
      <h2>{title}</h2>
      <p>{description}</p>
      <span className="settings-coming-soon">Coming soon</span>
    </section>
  );
}
