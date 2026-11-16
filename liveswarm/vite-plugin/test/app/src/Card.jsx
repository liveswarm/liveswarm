export function Card({ title, children, ...rest }) {
  return (
    <div className="card" {...rest}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
