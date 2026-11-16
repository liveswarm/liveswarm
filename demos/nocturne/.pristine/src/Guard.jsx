import { Component } from "react";

// Keeps one broken section from blanking the whole filmed page. While a section's file is
// mid-rewrite and throws, its slot shows the empty stage; Fast Refresh retries after the next edit.
export default class Guard extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev) {
    if (this.state.failed && prev.children !== this.props.children) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
