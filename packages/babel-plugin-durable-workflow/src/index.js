module.exports = function (api) {
  api.assertVersion(7);
  const { types: t } = api;

  function getFunctionContext(path) {
    const expr = path.node.expression;
    let retryConfig = t.objectExpression([]);

    if (t.isIdentifier(expr) && expr.name === 'workflow') {
    } else if (
      t.isCallExpression(expr) &&
      t.isIdentifier(expr.callee) &&
      expr.callee.name === 'workflow'
    ) {
      if (expr.arguments.length > 0) {
        retryConfig = expr.arguments[0];
      }
    } else {
      return null;
    }

    const parentPath = path.parentPath;
    const parentNode = parentPath.node;
    let functionPath = null;
    let functionName = '';
    let isAsync = false;

    if (t.isClassMethod(parentNode) || t.isObjectMethod(parentNode)) {
      let classPath = parentPath.parentPath;
      if (classPath && classPath.isClassBody()) {
        classPath = classPath.parentPath;
      }
      const classNode =
        classPath &&
        (classPath.isClassDeclaration() || classPath.isClassExpression())
          ? classPath.node
          : null;
      const className = classNode && classNode.id ? classNode.id.name : '';
      const key = parentNode.key;
      const methodName = t.isIdentifier(key)
        ? key.name
        : t.isStringLiteral(key)
          ? key.value
          : '';
      functionName = className ? `${className}.${methodName}` : methodName;
      functionPath = parentPath;
      isAsync = parentNode.async;
    } else if (t.isFunctionDeclaration(parentNode)) {
      functionName = parentNode.id ? parentNode.id.name : 'anonymous';
      functionPath = parentPath;
      isAsync = parentNode.async;
    } else if (
      t.isFunctionExpression(parentNode) ||
      t.isArrowFunctionExpression(parentNode)
    ) {
      if (t.isFunctionExpression(parentNode) && parentNode.id) {
        functionName = parentNode.id.name;
      } else {
        const varPath = parentPath.parentPath;
        if (varPath && varPath.isVariableDeclarator() && t.isIdentifier(varPath.node.id)) {
          functionName = varPath.node.id.name;
        } else if (varPath && varPath.isAssignmentExpression() && t.isIdentifier(varPath.node.left)) {
          functionName = varPath.node.left.name;
        } else {
          functionName = 'anonymous';
        }
      }
      functionPath = parentPath;
      isAsync = parentNode.async;
    } else {
      return null;
    }

    if (!isAsync) {
      throw path.buildCodeFrameError(
        '@workflow decorator can only be applied to async functions'
      );
    }

    return { functionPath, functionName, retryConfig, parentNode };
  }

  function findStepComment(awaitPath) {
    const exprStmt = awaitPath.findParent((p) => p.isExpressionStatement());
    if (exprStmt) {
      const comments = exprStmt.node.leadingComments;
      if (comments) {
        for (const c of comments) {
          const m = c.value
            .trim()
            .match(/^@step\s*\(\s*(["'])([^"']+)\1\s*\)/);
          if (m) return m[2];
        }
      }
    }
    const comments = awaitPath.node.leadingComments;
    if (comments) {
      for (const c of comments) {
        const m = c.value
          .trim()
          .match(/^@step\s*\(\s*(["'])([^"']+)\1\s*\)/);
        if (m) return m[2];
      }
    }
    return null;
  }

  function transformFunction(ctx) {
    const { functionPath, functionName, retryConfig } = ctx;
    const bodyPath = functionPath.get('body');
    if (!bodyPath || !bodyPath.isBlockStatement()) return;

    const awaitItems = [];
    bodyPath.traverse({
      enter(childPath) {
        if (childPath.isFunction() && childPath.node !== functionPath.node) {
          childPath.skip();
          return;
        }
        if (childPath.isAwaitExpression()) {
          awaitItems.push(childPath);
        }
      },
    });

    for (let i = awaitItems.length - 1; i >= 0; i--) {
      const awaitPath = awaitItems[i];

      const explicitName = findStepComment(awaitPath);
      const stepId = explicitName
        ? `${functionName}:${explicitName}`
        : `${functionName}:${i}`;

      const stepCall = t.callExpression(t.identifier('__step'), [
        t.stringLiteral(stepId),
        t.arrowFunctionExpression([], awaitPath.node.argument),
        retryConfig,
      ]);

      awaitPath.get('argument').replaceWith(stepCall);
    }
  }

  return {
    visitor: {
      Decorator(path) {
        const ctx = getFunctionContext(path);
        if (!ctx) return;

        transformFunction(ctx);

        path.remove();
        if (
          ctx.parentNode.decorators &&
          ctx.parentNode.decorators.length === 0
        ) {
          ctx.parentNode.decorators = null;
        }
      },
    },
  };
};
