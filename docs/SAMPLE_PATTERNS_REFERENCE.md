# Sample Patterns Reference

**Purpose**: This document preserves useful patterns from the original sample code before removal.
**Date**: Created during Issue #1 implementation
**Status**: Reference document - will be removed after Phase 1 completion

## Workflow Pattern

### DefineWorkflow Usage
```typescript
import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";

const SampleWorkflow = DefineWorkflow({
  callback_id: "sample_workflow",
  title: "Sample workflow",
  description: "A sample workflow",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channel: { type: Schema.slack.types.channel_id },
      user: { type: Schema.slack.types.user_id },
    },
    required: ["interactivity", "channel", "user"],
  },
});
```

### OpenForm Step Pattern
```typescript
const inputForm = SampleWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Send message to channel",
    interactivity: SampleWorkflow.inputs.interactivity,
    submit_label: "Send message",
    fields: {
      elements: [{
        name: "channel",
        title: "Channel to send message to",
        type: Schema.slack.types.channel_id,
        default: SampleWorkflow.inputs.channel,
      }, {
        name: "message",
        title: "Message",
        type: Schema.types.string,
        long: true,
      }],
      required: ["channel", "message"],
    },
  },
);
```

### Custom Function Step Integration
```typescript
const sampleFunctionStep = SampleWorkflow.addStep(SampleFunctionDefinition, {
  message: inputForm.outputs.fields.message,
  user: SampleWorkflow.inputs.user,
});
```

### SendMessage Step Pattern
```typescript
SampleWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: inputForm.outputs.fields.channel,
  message: sampleFunctionStep.outputs.updatedMsg,
});
```

## Function Pattern

### DefineFunction Structure
```typescript
import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const SampleFunctionDefinition = DefineFunction({
  callback_id: "sample_function",
  title: "Sample function",
  description: "A sample function",
  source_file: "functions/sample_function.ts",
  input_parameters: {
    properties: {
      message: { type: Schema.types.string, description: "Message to be posted" },
      user: { type: Schema.slack.types.user_id, description: "The user invoking the workflow" },
    },
    required: ["message", "user"],
  },
  output_parameters: {
    properties: {
      updatedMsg: { type: Schema.types.string, description: "Updated message to be posted" },
    },
    required: ["updatedMsg"],
  },
});
```

### SlackFunction Implementation Pattern
```typescript
export default SlackFunction(
  SampleFunctionDefinition,
  async ({ inputs, client }) => {
    // Processing logic here
    const uuid = crypto.randomUUID();

    const updatedMsg = `:wave: <@${inputs.user}> submitted: \n\n>${inputs.message}`;

    // Datastore interaction pattern
    const putResponse = await client.apps.datastore.put<typeof SampleObjectDatastore.definition>({
      datastore: "SampleObjects",
      item: { /* object data */ },
    });

    if (!putResponse.ok) {
      return { error: `Failed to put item: ${putResponse.error}` };
    }

    return { outputs: { updatedMsg } };
  },
);
```

## Datastore Operations Pattern

### PUT Operation
```typescript
const putResponse = await client.apps.datastore.put<typeof DatastoreType.definition>({
  datastore: "DatastoreName",
  item: objectToStore,
});

if (!putResponse.ok) {
  return { error: `Failed to put item: ${putResponse.error}` };
}
```

## Trigger Pattern (Shortcut Type)

### Basic Shortcut Trigger
```typescript
import type { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";

const sampleTrigger: Trigger<typeof SampleWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Sample trigger",
  description: "A sample trigger",
  workflow: `#/workflows/${SampleWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: { value: TriggerContextData.Shortcut.interactivity },
    channel: { value: TriggerContextData.Shortcut.channel_id },
    user: { value: TriggerContextData.Shortcut.user_id },
  },
};
```

## Test Pattern

### SlackFunctionTester Usage
```typescript
import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";

const { createContext } = SlackFunctionTester("sample_function");

Deno.test("Sample function test", async () => {
  using _stubFetch = stub(globalThis, "fetch", async () => {
    return new Response('{"ok": true}', { status: 200 });
  });

  const inputs = { message: "Hello, World!", user: "U01234567" };
  const { outputs, error } = await SampleFunction(createContext({ inputs }));

  assertEquals(error, undefined);
  assertEquals(outputs?.updatedMsg, "expected output");
});
```

---

**Note**: These patterns will be adapted and used in the PR tracking implementation during Phase 1 and Phase 2 development.