/**
 * Utility functions for ChittyRouter frontend
 */

export function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

export function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case "healthy":
    case "online":
    case "success":
    case "completed":
      return "green";
    case "warning":
    case "degraded":
    case "pending":
      return "yellow";
    case "error":
    case "offline":
    case "failed":
    case "critical":
      return "red";
    case "loading":
    case "processing":
      return "blue";
    default:
      return "gray";
  }
}

export function getStatusIcon(status) {
  const color = getStatusColor(status);
  return `status-${
    color === "green"
      ? "healthy"
      : color === "yellow"
        ? "warning"
        : color === "red"
          ? "error"
          : color === "blue"
            ? "loading"
            : "loading"
  }`;
}

export function truncateText(text, length = 50) {
  if (text.length <= length) return text;
  return text.substr(0, length) + "...";
}

export function parseChittyID(chittyId) {
  if (!chittyId) return null;

  // Standard ChittyID format: CE-hash-EMAIL-timestamp
  const standardMatch = chittyId.match(
    /^(C[ECPD])-([a-f0-9]+)-(EMAIL|DOC|CASE|PERSON)-(\d+)$/,
  );
  if (standardMatch) {
    return {
      prefix: standardMatch[1],
      hash: standardMatch[2],
      type: standardMatch[3],
      timestamp: parseInt(standardMatch[4]),
      format: "standard",
    };
  }

  // Media ChittyID format: CHITTY-SOURCE-timestamp-hash
  const mediaMatch = chittyId.match(/^CHITTY-([A-Z]+)-(\d+)-([a-f0-9]+)$/);
  if (mediaMatch) {
    return {
      source: mediaMatch[1],
      timestamp: parseInt(mediaMatch[2]),
      hash: mediaMatch[3],
      format: "media",
    };
  }

  // Fallback format
  const fallbackMatch = chittyId.match(/^(.*)-FALLBACK-(\d+)-(.+)$/);
  if (fallbackMatch) {
    return {
      prefix: fallbackMatch[1],
      timestamp: parseInt(fallbackMatch[2]),
      suffix: fallbackMatch[3],
      format: "fallback",
    };
  }

  return { raw: chittyId, format: "unknown" };
}

export function getChittyIDTypeColor(type) {
  switch (type?.toLowerCase()) {
    case "email":
      return "blue";
    case "document":
    case "doc":
      return "green";
    case "case":
      return "purple";
    case "participant":
    case "person":
      return "orange";
    case "media":
      return "pink";
    default:
      return "gray";
  }
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function copyToClipboard(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return Promise.resolve();
    } catch (err) {
      document.body.removeChild(textArea);
      return Promise.reject(err);
    }
  }
}

export function generateRandomId(length = 8) {
  // Use ChittyOS-compliant deterministic ID generation
  const timestamp = Date.now().toString();
  return timestamp.substring(timestamp.length - length);
}

export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
  return num.toString();
}

export function getHealthScore(services) {
  if (!services || services.length === 0) return 0;

  const healthyCount = services.filter((s) => s.status === "healthy").length;
  return Math.round((healthyCount / services.length) * 100);
}

export function sortByDate(items, key = "timestamp", order = "desc") {
  return [...items].sort((a, b) => {
    const dateA = new Date(a[key]);
    const dateB = new Date(b[key]);
    return order === "desc" ? dateB - dateA : dateA - dateB;
  });
}

export function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const value = item[key];
    if (!groups[value]) {
      groups[value] = [];
    }
    groups[value].push(item);
    return groups;
  }, {});
}
