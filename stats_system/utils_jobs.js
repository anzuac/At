//utils_jobs.js


window.getBaseJob = function getBaseJob(jobKey) {
  let k = (jobKey || "").toLowerCase();
  const J = window.jobs || {};
  const seen = new Set();
  while (k && J[k]?.parent && !seen.has(k)) {
    seen.add(k);
    k = String(J[k].parent).toLowerCase();
  }
  return k || (jobKey || "").toLowerCase();
};