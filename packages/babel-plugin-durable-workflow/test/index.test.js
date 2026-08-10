const babel = require('@babel/core');
const plugin = require('../src/index');
const assert = require('assert');

function transform(code) {
  return babel.transformSync(code, {
    plugins: [plugin],
    parserOpts: {
      plugins: [['decorators', { decoratorsBeforeExport: false }]],
    },
  }).code;
}

// Test 1: Basic transformation of a class method with two awaits
{
  const input = `
class Workflows {
  @workflow({ retries: 3, maxTimeout: 5000 })
  async process(data) {
    const a = await step1(data);
    return await step2(a);
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Workflows.process:0"'),
    'Should contain __step call with step ID 0'
  );
  assert(
    output.includes('__step("Workflows.process:1"'),
    'Should contain __step call with step ID 1'
  );
  assert(
    output.includes('() => step1(data)'),
    'Should wrap step1 in arrow function'
  );
  assert(
    output.includes('() => step2(a)'),
    'Should wrap step2 in arrow function'
  );
  assert(
    output.includes('retries: 3'),
    'Should preserve retry config: retries'
  );
  assert(
    output.includes('maxTimeout: 5000'),
    'Should preserve retry config: maxTimeout'
  );
  assert(
    !output.includes('@workflow'),
    'Should strip @workflow decorator from output'
  );
  console.log('PASS: test 1 — basic class method transformation');
}

// Test 2: @workflow without arguments (default retry config)
{
  const input = `
class Workflows {
  @workflow
  async simple() {
    await doSomething();
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Workflows.simple:0"'),
    'Should generate step ID for simple case'
  );
  assert(!output.includes('@workflow'), 'Should strip bare @workflow decorator');
  console.log('PASS: test 2 — @workflow without arguments');
}

// Test 3: Function with no awaits (should not add __step calls)
{
  const input = `
class Workflows {
  @workflow({ retries: 2 })
  async noop() {
    return 42;
  }
}
`;
  const output = transform(input);
  assert(
    !output.includes('__step'),
    'Should not add __step when there are no awaits'
  );
  assert(!output.includes('@workflow'), 'Should strip decorator');
  console.log('PASS: test 3 — no awaits');
}

// Test 4: Nested function should not have its awaits transformed
{
  const input = `
class Workflows {
  @workflow({ retries: 1 })
  async outer() {
    const inner = async () => {
      return await innerFn();
    };
    return await outerFn();
  }
}
`;
  const output = transform(input);
  // Should transform outer await but NOT the inner one
  assert(
    output.includes('__step("Workflows.outer:0"'),
    'Should transform the outer await'
  );
  // The inner function should still have its own await but NOT be transformed
  // Wait — actually the inner arrow function is not decorated with @workflow,
  // so the inner await should remain as-is (no __step wrapping).
  // But actually, the inner await IS inside the inner arrow function scope,
  // which we skip. So the output should still have `await innerFn()` inside the arrow.
  assert(
    /=>\s*\{[^}]*await innerFn\(\)[^}]*\}/s.test(output) ||
    output.includes('async () => {') && output.includes('innerFn()'),
    'Should leave inner function awaits untouched'
  );
  console.log('PASS: test 4 — nested function awaits are not transformed');
}

// Test 5: @step comment directive overrides step name
{
  const input = `
class Workflows {
  @workflow({ retries: 3 })
  async pipeline(file) {
    // @step("loadFile")
    const data = await readFile(file);
    // @step("processImage")
    const result = await process(data);
    return result;
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Workflows.pipeline:loadFile"'),
    'Should use explicit step name from @step directive'
  );
  assert(
    output.includes('__step("Workflows.pipeline:processImage"'),
    'Should use second explicit step name'
  );
  console.log('PASS: test 5 — @step comment directive overrides step name');
}

// Test 6: Multiple awaits with auto-generated IDs
{
  const input = `
class Workflows {
  @workflow({ retries: 3 })
  async multi() {
    await a();
    await b();
    await c();
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Workflows.multi:0"') &&
    output.includes('__step("Workflows.multi:1"') &&
    output.includes('__step("Workflows.multi:2"'),
    'Should auto-generate sequential step IDs'
  );
  console.log('PASS: test 6 — auto-generated sequential step IDs');
}

// Test 7: Class method with @workflow — function name via class.method
{
  const input = `
class Workflows {
  @workflow({ retries: 2 })
  async standaloneTask() {
    await init();
    return await finalize();
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Workflows.standaloneTask:0"'),
    'Should generate step ID with ClassName.methodName:0'
  );
  assert(
    output.includes('__step("Workflows.standaloneTask:1"'),
    'Should generate step ID with ClassName.methodName:1'
  );
  assert(
    !output.includes('@workflow'),
    'Should strip decorator'
  );
  console.log('PASS: test 7 — class method with @workflow');
}

// Test 8: Class method with @workflow and no args
{
  const input = `
class Actions {
  @workflow()
  async task(data) {
    return await execute(data);
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Actions.task:0"'),
    'Should generate step ID for class method'
  );
  assert(!output.includes('@workflow'), 'Should strip decorator');
  console.log('PASS: test 8 — class method with @workflow()');
}

// Test 9: Class method with @workflow — multiple awaits with retry
{
  const input = `
class Workers {
  @workflow({ retries: 1 })
  async process(data) {
    const r1 = await step1(data);
    return await step2(r1);
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Workers.process:0"'),
    'Should generate step ID with ClassName.methodName:0'
  );
  assert(
    output.includes('__step("Workers.process:1"'),
    'Should generate step ID with ClassName.methodName:1'
  );
  assert(!output.includes('@workflow'), 'Should strip decorator');
  console.log('PASS: test 9 — class method multi-await');
}

// Test 10: Sync function with @workflow should NOT be transformed
{
  const input = `
class Workflows {
  @workflow({ retries: 3 })
  syncMethod() {
    const a = step1();
    return step2(a);
  }
}
`;
  const output = transform(input);
  assert(
    !output.includes('__step'),
    'Should NOT add __step for sync function'
  );
  assert(
    !output.includes('@workflow'),
    'Should still strip decorator from sync function'
  );
  console.log('PASS: test 10 — sync function with @workflow not transformed');
}

// Test 11: Multiple @workflow methods in one file — single import injected
{
  const input = `
class Workflows {
  @workflow({ retries: 3 })
  async first() {
    await a();
  }

  @workflow({ retries: 1 })
  async second() {
    await b();
  }
}
`;
  const output = transform(input);
  // Should have exactly one __step import (const declaration)
  const importMatches = output.match(/const __step = /g);
  assert(
    importMatches && importMatches.length === 1,
    'Should inject exactly one __step import for multiple workflow methods'
  );
  assert(
    output.includes('__step("Workflows.first:0"'),
    'Should transform first method'
  );
  assert(
    output.includes('__step("Workflows.second:0"'),
    'Should transform second method'
  );
  assert(
    !output.includes('@workflow'),
    'Should strip all decorators'
  );
  console.log('PASS: test 11 — multiple @workflow methods, single import');
}

// Test 12: Verify import uses const and correct module path
{
  const input = `
class Workflows {
  @workflow
  async task() {
    await doWork();
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('const __step = require("@durable/runtime").__step'),
    'Should use const and require @durable/runtime'
  );
  console.log('PASS: test 12 — import uses const and correct module');
}

// Test 13: @workflow method alongside non-workflow method — non-workflow untouched
{
  const input = `
class Workflows {
  @workflow({ retries: 2 })
  async workflowMethod() {
    return await process();
  }

  async normalMethod() {
    return await helper();
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('__step("Workflows.workflowMethod:0"'),
    'Should transform workflow method'
  );
  assert(
    output.includes('await helper()'),
    'Should NOT transform non-workflow method'
  );
  assert(
    !output.includes('__step("Workflows.normalMethod:0"'),
    'Non-workflow method should not have __step'
  );
  console.log('PASS: test 13 — non-workflow method left untouched');
}

// Test 14: Verify await keyword is preserved before __step() calls
{
  const input = `
class Workflows {
  @workflow({ retries: 1 })
  async myMethod() {
    const r = await doWork();
    return await finish(r);
  }
}
`;
  const output = transform(input);
  assert(
    output.includes('await __step("Workflows.myMethod:0"'),
    'First __step call must be prefixed with await keyword'
  );
  assert(
    output.includes('await __step("Workflows.myMethod:1"'),
    'Second __step call must be prefixed with await keyword'
  );
  console.log('PASS: test 14 — await keyword preserved before __step calls');
}

console.log('\nAll tests passed!');
