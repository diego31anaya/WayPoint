import './AccountPage.css'

function AccountPage({ onAccountCreated, onBack }) {
  function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    onAccountCreated({ email })
    event.currentTarget.reset()
  }

  return (
    <main className="account-page">
      <header className="site-header page-shell">
        <a
          className="brand"
          href="#home"
          aria-label="WayPoint home"
          onClick={(event) => {
            event.preventDefault()
            onBack()
          }}
        >
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>WayPoint</span>
        </a>
        <button className="account-back-button" type="button" onClick={onBack}>← Back</button>
      </header>

      <section className="account-page-content page-shell">
        <div className="account-welcome-panel">
          <span className="account-kicker">A BETTER VIEW STARTS HERE</span>
          <h1>Make room for<br /><em>what’s next.</em></h1>
          <p>Create your account to keep your neighborhood research and business insights together.</p>
          <div className="account-orbit" aria-hidden="true">
            <span className="account-orbit-ring ring-one" />
            <span className="account-orbit-ring ring-two" />
            <span className="account-orbit-center">W</span>
            <i className="account-orbit-dot dot-one" />
            <i className="account-orbit-dot dot-two" />
            <i className="account-orbit-dot dot-three" />
          </div>
        </div>

        <div className="account-form-panel">
          <div className="account-form-heading">
            <span className="eyebrow">GET STARTED WITH WAYPOINT</span>
            <h2>Create your account</h2>
            <p>Use your email to set up your workspace.</p>
          </div>
          <form className="account-form" onSubmit={handleSubmit}>
            <label htmlFor="account-email">Email address</label>
            <input
              id="account-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@business.com"
              required
            />
            <label htmlFor="account-password">Password</label>
            <input
              id="account-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              placeholder="At least 8 characters"
              required
            />
            <button type="submit">Create account <span>→</span></button>
          </form>
          <p className="account-demo-note">
            Demo mode: your password is not sent or saved. Account creation will connect to authentication when a backend is available.
          </p>
        </div>
      </section>
    </main>
  )
}

export default AccountPage
