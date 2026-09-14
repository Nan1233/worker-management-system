function resolveRouteModule(moduleValue, name) {
  const route = typeof moduleValue === "function"
    ? moduleValue
    : moduleValue && typeof moduleValue.default === "function"
      ? moduleValue.default
      : moduleValue && typeof moduleValue.router === "function"
        ? moduleValue.router
        : null;

  if (typeof route !== "function") {
    throw new TypeError(
      `[KTC] Invalid route module ${name}: expected Express router/function, got ${typeof moduleValue}`
    );
  }

  return route;
}

module.exports = { resolveRouteModule };
