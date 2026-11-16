import { Fragment, useState } from 'react';
import { Card } from './Card.jsx';

const ui = { Panel: (props) => <section {...props} /> };

export default function App() {
  const [n, setN] = useState(0);
  return (
    <main id="app">
      <h1 id="title">Hello liveswarm</h1>
      <button id="inc" onClick={() => setN(n + 1)}>
        count {n}
      </button>
      <ul id="list">
        {[1, 2].map((i) => (
          <li key={i}>item {i}</li>
        ))}
      </ul>
      {n > 100 ? <p>big</p> : <p id="small">small</p>}
      <Fragment>
        <span id="frag">frag</span>
      </Fragment>
      <Card title="Wrapped" id="card">
        <em>inside</em>
      </Card>
      <ui.Panel id="panel" />
    </main>
  );
}
