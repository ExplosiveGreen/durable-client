const { declare } = require("@babel/helper-plugin-utils");

function extractRetryConfig(t, node) {
  if (!t.isObjectExpression(node)) return t.identifier("undefined");
  return node;
}

function getLeadingStepComment(path) {
  // Walk up the parent chain to find the nearest statement that may
  // have a leading @step comment attached to it.
  let target = path;
  while (target && !target.isStatement()) {
    target = target.parentPath;
    if (!target || target.isFunction()) break;
  }
  if (!target) return null;

  const comments = target.node.leadingComments;
  if (!comments) return null;
  for (const comment of comments) {
    const match = comment.value.match(/@step\s*\(\s*"([^"]+)"\s*\)/);
    if (match) return match[1];
  }
  return null;
}

function getFunctionName(path) {
  // Handle ClassMethod and ObjectMethod directly (path IS the method)
  if (path.isClassMethod() || path.isObjectMethod()) {
    const className = path.parentPath.isClassBody()
      ? path.parentPath.parentPath.get("id").node?.name || "AnonymousClass"
      : null;
    const methodName =
      path.node.key.name || path.node.key.value || "anonymous";
    return className ? `${className}.${methodName}` : methodName;
  }
  if (path.isFunctionDeclaration() && path.get("id").node) {
    return path.get("id").node.name;
  }
  if (
    (path.isFunctionExpression() || path.isArrowFunctionExpression()) &&
    path.parentPath.isVariableDeclarator()
  ) {
    return path.parentPath.get("id").node?.name || "anonymous";
  }
  // Named function expression (e.g., async function foo() {})
  if (path.isFunctionExpression() && path.node.id) {
    return path.node.id.name;
  }
  return "anonymous";
}

module.exports = declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "babel-plugin-durable-workflow",
    visitor: {
      Program(programPath) {
        let needsImport = false;

        programPath.traverse({
          "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassMethod|ObjectMethod"(
            path
          ) {
            const bodyPath = path.get("body");
            if (!bodyPath.isBlockStatement()) return;

            const decorators = path.node.decorators || [];

            // Find @workflow or @workflow(...) decorator
            const workflowIdx = decorators.findIndex((d) => {
              if (
                t.isCallExpression(d.expression) &&
                t.isIdentifier(d.expression.callee, { name: "workflow" })
              ) {
                return true;
              }
              if (t.isIdentifier(d.expression, { name: "workflow" })) {
                return true;
              }
              return false;
            });

            if (workflowIdx === -1) return;

            const decoratorNode = decorators[workflowIdx];

            // Extract retry config from decorator arguments
            let retryConfig;
            if (t.isCallExpression(decoratorNode.expression)) {
              retryConfig =
                decoratorNode.expression.arguments.length > 0
                  ? extractRetryConfig(t, decoratorNode.expression.arguments[0])
                  : t.identifier("undefined");
            } else {
              // Bare @workflow (no parentheses, no arguments)
              retryConfig = t.identifier("undefined");
            }

            // Remove the @workflow decorator from the AST
            decorators.splice(workflowIdx, 1);
            path.node.decorators = decorators.length > 0 ? decorators : null;

            const fnName = getFunctionName(path);
            let awaitIndex = 0;

            bodyPath.traverse({
              AwaitExpression(awaitPath) {
                // Skip if this await is inside any nested function.
                // We compare against `path` (the current workflow function) —
                // if findParent finds a function that is NOT the current
                // workflow function, then the await is inside a nested function.
                if (
                  awaitPath.findParent(
                    (p) => p.isFunction() && p !== path
                  )
                )
                  return;

                const explicitName = getLeadingStepComment(awaitPath);
                const stepId = explicitName
                  ? `${fnName}:${explicitName}`
                  : `${fnName}:${awaitIndex}`;
                awaitIndex++;

                awaitPath.replaceWith(
                  t.callExpression(t.identifier("__step"), [
                    t.stringLiteral(stepId),
                    t.arrowFunctionExpression([], awaitPath.node.argument),
                    retryConfig,
                  ])
                );
              },
            });

            if (awaitIndex > 0) {
              needsImport = true;
            }
          },
        });

        if (needsImport) {
          const importStmt = t.variableDeclaration("var", [
            t.variableDeclarator(
              t.identifier("__step"),
              t.memberExpression(
                t.callExpression(t.identifier("require"), [
                  t.stringLiteral("@durable/runtime"),
                ]),
                t.identifier("__step")
              )
            ),
          ]);
          programPath.node.body.unshift(importStmt);
        }
      },
    },
  };
});
