import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Last line of defence: shows a friendly screen instead of a blank page if rendering throws. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="crash">
        <div className="card">
          <h2>Something went wrong</h2>
          <p>The page hit an unexpected problem. Your trip data was not lost on the server — reload to start again.</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Reload the app
          </button>
        </div>
      </div>
    )
  }
}
