// Misc helpers.

export function safeImage(url, fallback = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1200') {
  if (!url) return fallback;
  return url;
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
