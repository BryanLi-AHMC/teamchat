import "./App.css";

const mockMessages = [
  { id: "m1", sender: "Dr. Li", time: "09:02", body: "Good morning team." },
  {
    id: "m2",
    sender: "Nurse Kim",
    time: "09:06",
    body: "Admissions list updated in the shared drive.",
  },
  {
    id: "m3",
    sender: "Alex",
    time: "09:11",
    body: "Reviewing blockers for afternoon sprint check-in.",
  },
];

const mockProgress = [
  {
    person: "Dr. Li",
    completed: "Daily staffing review submitted",
    workingOn: "Coordination with triage desk",
    blockers: "Pending approval on schedule changes",
  },
  {
    person: "Nurse Kim",
    completed: "Updated handoff notes",
    workingOn: "Preparing discharge follow-ups",
    blockers: "Awaiting final documentation",
  },
];

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1 className="app-title">TeamChat</h1>
          <p className="subtitle">Internal communication</p>
        </div>

        <nav className="sidebar-sections">
          <section>
            <h2>Direct Messages</h2>
            <ul>
              <li>Dr. Li</li>
              <li>Nurse Kim</li>
              <li>Alex</li>
            </ul>
          </section>
          <section>
            <h2>Group Chats</h2>
            <ul>
              <li>Clinical Ops</li>
              <li>Care Coordination</li>
            </ul>
          </section>
          <section>
            <h2>Progress Board</h2>
            <ul>
              <li>Today</li>
            </ul>
          </section>
        </nav>
      </aside>

      <main className="chat-panel">
        <header className="panel-header">
          <h2>Clinical Ops</h2>
        </header>

        <div className="message-list">
          {mockMessages.map((message) => (
            <article key={message.id} className="message-item">
              <div className="message-meta">
                <strong>{message.sender}</strong>
                <span>{message.time}</span>
              </div>
              <p>{message.body}</p>
            </article>
          ))}
        </div>

        <footer className="chat-input-bar">
          <input type="text" placeholder="Type an update..." />
          <button type="button">Send</button>
        </footer>
      </main>

      <aside className="progress-panel">
        <header className="panel-header">
          <h2>Today&apos;s Progress</h2>
        </header>
        <div className="progress-list">
          {mockProgress.map((item) => (
            <article key={item.person} className="progress-card">
              <h3>{item.person}</h3>
              <p>
                <strong>Completed:</strong> {item.completed}
              </p>
              <p>
                <strong>Working on:</strong> {item.workingOn}
              </p>
              <p>
                <strong>Blockers:</strong> {item.blockers}
              </p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default App;
