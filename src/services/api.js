export function apiUrl(path) {
  if (window.location.protocol === "file:") {
    return `http://127.0.0.1:3001${path}`;
  }

  return path;
}
