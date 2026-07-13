const { declare } = require("@babel/helper-plugin-utils");
const types = require("@babel/types");
const template = require("@babel/template");

function extractRetryConfig(t, node) {
  if (!t.isObjectExpression(node)) return t.identifier("undefined");
  return node;
}

function getLeadingStepComment(path) {
  const comments = path.node.leadingComments;
  if (!comments) return null;
  for (const comment of comments) {
    const match = comment.value.match(/@step\s*\(\s*"([^"]+)"\s*\)/);
    if (match) return match[1];
  }
  return null;
}

function getFunctionName(path) {
  const parent = path.parentPath;
  if (parent.isObjectMethod() || parent.isClassMethod()) {
    const className = parent.parentPath.isClassBody()
      ? parent.parentPath.parentPath.get("id").node?.name || "AnonymousClass"
      : null;
    const methodName = parent.node.key.name || parent.node.key.value || "anonymous";
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
  return "anonymous";
}

module.exports = declare((api) => {
  api.assertVersion(7);
  const t = api.types;

  return {
    name: "babel-plugin-durable-workflow",
    visitor: {
      Program(programPath) {
        programPath.traverse({
          "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassMethod|ObjectMethod"(
            path
          ) {
            const bodyPath = path.get("body");
            if (!bodyPath.isBlockStatement()) return;

            const decorators = path.node.decorators || [];
            const workflowDecoratorIndex = decorators.findIndex(
              (d) =>
                t.isCallExpression(d.expression) &&
                t.isIdentifier(d.expression.callee, { name: "workflow" })
            );
            if (workflowDecoratorIndex === -1) return;

            const decoratorNode = decorators[workflowDecoratorIndex];
            const retryConfig =
              decoratorNode.expression.arguments.length > 0
                ? extractRetryConfig(t, decoratorNode.expression.arguments[0])
                : t.identifier("undefined");

            decorators.splice(workflowDecoratorIndex, 1);
            path.node.decorators =
              decorators.length > 0 ? decorators : null;

            const fnName = getFunctionName(path);
            let awaitIndex = 0;

            bodyPath.traverse({
              AwaitExpression(awaitPath) {
                if (awaitPath.scope.getBinding("__step")) return;
                if (
                  awaitPath.findParent(
                    (p) =>
                      p.isFunction() &&
                      p !== bodyPath &&
                      !p.isArrowFunctionExpression()
                  )
                )
                  return;

                const explicitName = getLeadingStepComment(awaitPath);
                const stepId = explicitName || `${fnName}:${awaitIndex}`;
                awaitIndex++;

                const arg = awaitPath.node.argument;
                const stepCall = t.callExpression(
                  t.identifier("__step"),
                  [
                    t.stringLiteral(stepId),
                    t.arrowFunctionExpression([], arg),
                    retryConfig,
                  ]
                );
                awaitPath.replaceWith(stepCall);
              },
            });
          },
        });
      },
    },
  };
});
