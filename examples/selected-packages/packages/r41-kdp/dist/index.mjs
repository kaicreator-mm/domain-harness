// examples/reference-domain-app/packages/r41-kdp/src/kernel-lifecycle.ts
import { readFile as readFile3 } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createHash as createHash3 } from "node:crypto";

// packages/contracts/dist/schema-versions.js
var DH_DOMAIN_SCHEMA_VERSION = "dh.domain/0.11";
var DH_WORKFLOW_SCHEMA_VERSION = "dh.workflow/0.11";
var DH_ELEMENT_SCHEMA_VERSION = "dh.element/0.11";
var DH_PACKAGE_SCHEMA_VERSION = "dh.package/0.11";
var DH_APP_SCHEMA_VERSION = "dh.app/0.11";
var DH_LOCK_SCHEMA_VERSION = "dh.lock/0.11.1";
var DH_INSTALL_RECORD_SCHEMA_VERSION = "dh.install/0.11.1";

// packages/contracts/dist/element-contracts.js
var CORE_CONTENT_KINDS = [
  "semantic-model",
  "knowledge",
  "rule",
  "constraint",
  "workflow-definition",
  "state-model",
  "structured-data",
  "interaction",
  "document",
  "validation"
];

// packages/contracts/dist/workflow-contracts.js
function functionOutcomeRouteLabel(outcome) {
  if (outcome.kind !== "SUCCEEDED")
    return outcome.kind;
  const value = outcome.value;
  if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "route")) {
    const label = value["route"];
    return typeof label === "string" && label.length > 0 ? label : null;
  }
  return "SUCCEEDED";
}
function selectWorkflowTarget(exits, label) {
  if (label === null)
    return null;
  const matches = exits.filter((exit2) => exit2.label === label);
  return matches.length === 1 ? matches[0].target : null;
}
function childWorkflowRouteLabel(outcome) {
  return outcome.status;
}
function requiredFunctionCallsForNode(node) {
  return 1 + (node.hooks?.start ? 1 : 0) + (node.hooks?.end ? 1 : 0);
}
function hasWorkflowCallBudget(remaining, node) {
  return Number.isSafeInteger(remaining) && remaining >= requiredFunctionCallsForNode(node);
}
function withinWorkflowAncestorDepth(ancestors) {
  return ancestors.every((ancestor, index) => ancestors.length - index - 1 <= ancestor.maxDescendantWorkflowDepth);
}

// packages/contracts/dist/digest.js
import { createHash } from "node:crypto";
function canonicalJson(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const write = (input, out2) => {
    if (input === null || typeof input === "number" || typeof input === "boolean" || typeof input === "string") {
      if (typeof input === "number" && !Number.isFinite(input)) {
        throw new Error("current digest input carries a non-finite number");
      }
      out2.push(JSON.stringify(input));
      return;
    }
    if (typeof input !== "object")
      throw new Error("current digest input is not plain data");
    if (seen.has(input))
      throw new Error("current digest input contains a cycle");
    seen.add(input);
    try {
      if (Array.isArray(input)) {
        out2.push("[");
        for (let index = 0; index < input.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(input, index)) {
            throw new Error("current digest input contains a sparse array");
          }
          if (index > 0)
            out2.push(",");
          write(input[index], out2);
        }
        out2.push("]");
        return;
      }
      const keys = Object.keys(input).sort();
      out2.push("{");
      keys.forEach((key, index) => {
        if (index > 0)
          out2.push(",");
        out2.push(JSON.stringify(key), ":");
        write(input[key], out2);
      });
      out2.push("}");
    } finally {
      seen.delete(input);
    }
  };
  const out = [];
  write(value, out);
  return out.join("");
}
function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function contentDigestOf(value) {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}
var CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
function isContentDigest(value) {
  return typeof value === "string" && CONTENT_DIGEST_PATTERN.test(value);
}

// packages/contracts/dist/refs.js
var NODE22_ESM_PROFILE = "node22-esm/1";

// packages/contracts/dist/boot-contracts.js
var DH_KDP_HOST_EXIT_FENCE_KEY = "__dhKdpHostExitFence/1";

// packages/contracts/dist/json-schemas.js
var JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema";
var SCHEMA_BASE_ID = "https://kaicreator.dev/schemas/domain-harness";
var IDENTIFIER_PATTERN = "^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$";
var SEMVER_PATTERN = "^[0-9]+\\.[0-9]+\\.[0-9]+$";
var CONTENT_DIGEST_PATTERN2 = "^sha256:[0-9a-f]{64}$";
var RESOURCE_PATH_PATTERN = "^(?![\\s\\S]*\\\\)(?![A-Za-z]:)(?![\\s\\S]*(^|/)\\.{1,2}($|/))[^/]+(?:/[^/]+)*$";
var RESOURCE_REF_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["packageId", "path", "digest"],
  properties: {
    packageId: { type: "string", minLength: 1 },
    path: { type: "string", pattern: RESOURCE_PATH_PATTERN },
    digest: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 }
  }
};
var SCHEMA_REF_DEF = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["inline"],
      properties: { inline: {} }
    },
    { $ref: "#/$defs/resourceRef" }
  ]
};
var APPLICABILITY_DEF = {
  type: "object",
  additionalProperties: false,
  properties: {
    targets: { type: "array", items: { type: "string" } },
    when: {}
  }
};
var CONTENT_BLOCK_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["id", "contentKind", "schemaRef", "required"],
  properties: {
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    contentKind: { type: "string", minLength: 1 },
    schemaRef: { $ref: "#/$defs/schemaRef" },
    required: { type: "boolean" },
    value: {},
    ref: { $ref: "#/$defs/resourceRef" },
    applicability: APPLICABILITY_DEF,
    provenance: {
      type: "object",
      additionalProperties: false,
      properties: {
        source: { type: "string", minLength: 1 },
        refs: { type: "array", items: { $ref: "#/$defs/resourceRef" } }
      }
    }
  },
  allOf: [
    {
      oneOf: [
        {
          properties: { value: {} },
          required: ["value"],
          not: { properties: { ref: {} }, required: ["ref"] }
        },
        {
          properties: { ref: {} },
          required: ["ref"],
          not: { properties: { value: {} }, required: ["value"] }
        }
      ]
    },
    {
      if: { properties: { required: { const: true } }, required: ["required"] },
      then: {
        properties: {
          contentKind: {
            anyOf: [
              { enum: [...CORE_CONTENT_KINDS] },
              { type: "string", pattern: "^dh-ext\\." }
            ]
          }
        }
      }
    }
  ]
};
var STANDARD_FUNCTION_CONTRACT_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["id", "contractVersion", "inputSchemaRef", "outputSchemaRef", "outcomes", "effects"],
  properties: {
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    contractVersion: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    inputSchemaRef: { $ref: "#/$defs/schemaRef" },
    outputSchemaRef: { $ref: "#/$defs/schemaRef" },
    outcomes: {
      type: "array",
      minItems: 1,
      items: { enum: ["SUCCEEDED", "UNKNOWN", "FAILED"] },
      contains: { const: "SUCCEEDED" }
    },
    effects: { enum: ["none", "external", "state"] },
    applicability: APPLICABILITY_DEF
  }
};
var KDP_HOST_INIT_FUNCTION_CONTRACT_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["id", "contractVersion", "invocationAbi"],
  properties: {
    id: { const: "init" },
    contractVersion: { const: "1" },
    invocationAbi: { const: "kdp-host-init/1" },
    description: { type: "string", minLength: 1 }
  }
};
var FUNCTION_CONTRACT_DEF = {
  oneOf: [STANDARD_FUNCTION_CONTRACT_DEF, KDP_HOST_INIT_FUNCTION_CONTRACT_DEF]
};
var ELEMENT_DEFINITION_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "schemaVersion", "id", "version", "description", "content", "functions"],
  properties: {
    kind: { const: "Element" },
    schemaVersion: { const: DH_ELEMENT_SCHEMA_VERSION },
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    version: { type: "string", pattern: SEMVER_PATTERN },
    description: { type: "string", minLength: 1 },
    roles: { type: "array", items: { type: "string" } },
    content: { type: "array", items: { $ref: "#/$defs/contentBlock" } },
    functions: { type: "array", items: { $ref: "#/$defs/functionContract" } },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["element", "version"],
        properties: {
          element: { type: "string", pattern: IDENTIFIER_PATTERN },
          version: { type: "string", minLength: 1 },
          functions: { type: "array", items: { type: "string" } }
        }
      }
    },
    validation: {
      type: "object",
      additionalProperties: false,
      required: ["ref"],
      properties: { ref: { $ref: "#/$defs/resourceRef" } }
    }
  }
};
var ELEMENT_REF_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["namespace", "id", "version", "digest"],
  properties: {
    namespace: { type: "string", pattern: IDENTIFIER_PATTERN },
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    version: { type: "string", pattern: SEMVER_PATTERN },
    digest: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 }
  }
};
var FUNCTION_REF_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["element", "functionId", "contractVersion"],
  properties: {
    element: { $ref: "#/$defs/elementRef" },
    functionId: { type: "string", minLength: 1 },
    contractVersion: { type: "string", minLength: 1 }
  }
};
function defsEnvelope(docId, root, defs) {
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: `${SCHEMA_BASE_ID}/${docId}`,
    ...root,
    $defs: { ...defs }
  };
}
var ELEMENT_DEFINITION_JSON_SCHEMA = defsEnvelope("element.json", {
  $ref: "#/$defs/elementDefinition"
}, {
  resourceRef: RESOURCE_REF_DEF,
  schemaRef: SCHEMA_REF_DEF,
  applicability: APPLICABILITY_DEF,
  contentBlock: CONTENT_BLOCK_DEF,
  functionContract: FUNCTION_CONTRACT_DEF,
  elementDefinition: ELEMENT_DEFINITION_DEF
});
var DOMAIN_DEFINITION_JSON_SCHEMA = defsEnvelope("domain.json", {
  type: "object",
  additionalProperties: false,
  required: ["kind", "schemaVersion", "id", "version", "elements"],
  properties: {
    kind: { const: "Domain" },
    schemaVersion: { const: DH_DOMAIN_SCHEMA_VERSION },
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    version: { type: "string", pattern: SEMVER_PATTERN },
    description: { type: "string", minLength: 1 },
    elements: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/elementDefinition" }
    },
    semanticRelations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["relation", "from", "to"],
        properties: {
          relation: { type: "string", minLength: 1 },
          from: { type: "string", minLength: 1 },
          to: { type: "string", minLength: 1 },
          version: { type: "string", minLength: 1 }
        }
      }
    },
    constraints: { type: "array" }
  }
}, {
  resourceRef: RESOURCE_REF_DEF,
  schemaRef: SCHEMA_REF_DEF,
  applicability: APPLICABILITY_DEF,
  contentBlock: CONTENT_BLOCK_DEF,
  functionContract: FUNCTION_CONTRACT_DEF,
  elementDefinition: ELEMENT_DEFINITION_DEF
});
var CONTENT_BLOCK_JSON_SCHEMA = defsEnvelope("content-block.json", {
  $ref: "#/$defs/contentBlock"
}, {
  resourceRef: RESOURCE_REF_DEF,
  schemaRef: SCHEMA_REF_DEF,
  applicability: APPLICABILITY_DEF,
  contentBlock: CONTENT_BLOCK_DEF
});
var FUNCTION_CONTRACT_JSON_SCHEMA = defsEnvelope("function-contract.json", {
  $ref: "#/$defs/functionContract"
}, {
  resourceRef: RESOURCE_REF_DEF,
  schemaRef: SCHEMA_REF_DEF,
  applicability: APPLICABILITY_DEF,
  functionContract: FUNCTION_CONTRACT_DEF
});
var ELEMENT_REF_JSON_SCHEMA = defsEnvelope("element-ref.json", {
  type: "object",
  additionalProperties: false,
  required: ["namespace", "id", "version", "digest"],
  properties: {
    namespace: { type: "string", pattern: IDENTIFIER_PATTERN },
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    version: { type: "string", pattern: SEMVER_PATTERN },
    digest: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 }
  }
}, {});
var FUNCTION_REF_JSON_SCHEMA = defsEnvelope("function-ref.json", {
  $ref: "#/$defs/functionRef"
}, {
  elementRef: ELEMENT_REF_DEF,
  functionRef: FUNCTION_REF_DEF
});
var WORKFLOW_TARGET_DEF = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["nodeId"],
      properties: { nodeId: { type: "string", pattern: IDENTIFIER_PATTERN } }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["terminal"],
      properties: { terminal: { enum: ["COMPLETE", "REJECT", "ASK", "WAIT", "UNKNOWN", "FAILED"] } }
    }
  ]
};
var WORKFLOW_SWITCH_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["exits"],
  properties: {
    exits: {
      type: "array",
      minItems: 1,
      maxItems: 256,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "target"],
        properties: {
          label: { type: "string", pattern: IDENTIFIER_PATTERN },
          target: { $ref: "#/$defs/workflowTarget" }
        }
      }
    }
  }
};
var WORKFLOW_REF_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["element", "contentId"],
  properties: {
    element: { $ref: "#/$defs/elementRef" },
    contentId: { type: "string", pattern: IDENTIFIER_PATTERN }
  }
};
var WORKFLOW_DATA_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["format", "resource", "maxBytes"],
  properties: {
    format: { enum: ["json", "yaml"] },
    resource: { $ref: "#/$defs/resourceRef" },
    maxBytes: { type: "integer", minimum: 1, maximum: 1048576 }
  }
};
var WORKFLOW_HOOKS_DEF = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    start: { $ref: "#/$defs/functionRef" },
    end: { $ref: "#/$defs/functionRef" }
  }
};
var WORKFLOW_NODE_DEF = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "function", "switch"],
      properties: {
        id: { type: "string", pattern: IDENTIFIER_PATTERN },
        kind: { const: "function" },
        function: { $ref: "#/$defs/functionRef" },
        data: { $ref: "#/$defs/workflowData" },
        hooks: { $ref: "#/$defs/workflowHooks" },
        switch: { $ref: "#/$defs/workflowSwitch" }
      }
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "workflow", "switch"],
      properties: {
        id: { type: "string", pattern: IDENTIFIER_PATTERN },
        kind: { const: "workflow" },
        workflow: { $ref: "#/$defs/workflowRef" },
        switch: { $ref: "#/$defs/workflowSwitch" }
      }
    }
  ]
};
var WORKFLOW_DEFINITION_DEF = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "schemaVersion",
    "id",
    "entryNodeId",
    "maxElementCalls",
    "maxDescendantWorkflowDepth",
    "nodes"
  ],
  properties: {
    kind: { const: "Workflow" },
    schemaVersion: { const: DH_WORKFLOW_SCHEMA_VERSION },
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    entryNodeId: { type: "string", pattern: IDENTIFIER_PATTERN },
    maxElementCalls: { type: "integer", minimum: 1, maximum: 1e5 },
    maxDescendantWorkflowDepth: { type: "integer", minimum: 0, maximum: 32 },
    nodes: { type: "array", minItems: 1, maxItems: 1e4, items: { $ref: "#/$defs/workflowNode" } }
  }
};
var WORKFLOW_DEFINITION_JSON_SCHEMA = defsEnvelope("workflow-definition.json", WORKFLOW_DEFINITION_DEF, {
  resourceRef: RESOURCE_REF_DEF,
  elementRef: ELEMENT_REF_DEF,
  functionRef: FUNCTION_REF_DEF,
  workflowRef: WORKFLOW_REF_DEF,
  workflowTarget: WORKFLOW_TARGET_DEF,
  workflowSwitch: WORKFLOW_SWITCH_DEF,
  workflowData: WORKFLOW_DATA_DEF,
  workflowHooks: WORKFLOW_HOOKS_DEF,
  workflowNode: WORKFLOW_NODE_DEF
});
var DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA = defsEnvelope("package-manifest.json", {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "schemaVersion",
    "id",
    "version",
    "layer",
    "role",
    "init",
    "elements",
    "dependsOn",
    "imports",
    "exports",
    "contributesTo",
    "targetVariants"
  ],
  properties: {
    kind: { const: "DomainPackage" },
    schemaVersion: { const: DH_PACKAGE_SCHEMA_VERSION },
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    version: { type: "string", pattern: SEMVER_PATTERN },
    layer: { enum: ["kernel", "sdk", "business"] },
    role: { enum: ["primary", "extension"] },
    order: { type: "integer", minimum: 0 },
    init: { $ref: "#/$defs/elementRef" },
    exit: { $ref: "#/$defs/elementRef" },
    recordInitFrom: { const: true },
    description: { type: "string", minLength: 1 },
    elements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "version", "definitionRef", "visibility"],
        properties: {
          id: { type: "string", pattern: IDENTIFIER_PATTERN },
          version: { type: "string", pattern: SEMVER_PATTERN },
          definitionRef: { $ref: "#/$defs/resourceRef" },
          visibility: { enum: ["public", "private"] }
        }
      }
    },
    dependsOn: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["package", "version", "interface"],
        properties: {
          package: { type: "string", minLength: 1 },
          version: { type: "string", minLength: 1 },
          interface: { type: "string", minLength: 1 }
        }
      }
    },
    imports: { type: "array", items: { $ref: "#/$defs/functionRef" } },
    exports: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          elementId: { type: "string", minLength: 1 },
          functionId: { type: "string", minLength: 1 },
          interfaceId: { type: "string", minLength: 1 }
        }
      }
    },
    provides: {
      type: "object",
      additionalProperties: false,
      properties: {
        interfaces: { type: "array", items: { type: "object" } },
        hooks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "interfaceSchemaRef", "cardinality"],
            properties: {
              id: { type: "string", minLength: 1 },
              interfaceSchemaRef: { $ref: "#/$defs/schemaRef" },
              cardinality: { enum: ["single", "multi"] }
            }
          }
        }
      }
    },
    contributesTo: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ownerPackageId", "hookId", "function"],
        properties: {
          ownerPackageId: { type: "string", minLength: 1 },
          hookId: { type: "string", minLength: 1 },
          function: { $ref: "#/$defs/functionRef" }
        }
      }
    },
    workflowRoots: { type: "array", items: { $ref: "#/$defs/workflowRef" } },
    targetVariants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "implementations"],
        properties: {
          target: {
            type: "object",
            additionalProperties: false,
            required: ["runtime", "module"],
            properties: {
              runtime: { const: "node" },
              module: { const: "esm" },
              nodeMajor: { type: "integer", minimum: 0 }
            }
          },
          implementations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["elementId", "functionId", "contractVersion", "entry"],
              properties: {
                elementId: { type: "string", minLength: 1 },
                functionId: { type: "string", minLength: 1 },
                contractVersion: { type: "string", minLength: 1 },
                invocationAbi: { const: "kdp-host-init/1" },
                entry: { $ref: "#/$defs/implementationLocator" },
                resources: { type: "array", items: { $ref: "#/$defs/resourceRef" } }
              }
            }
          }
        }
      }
    }
  }
}, {
  resourceRef: RESOURCE_REF_DEF,
  schemaRef: SCHEMA_REF_DEF,
  implementationLocator: {
    type: "object",
    additionalProperties: false,
    required: ["module", "exportName"],
    properties: {
      module: { $ref: "#/$defs/resourceRef" },
      exportName: { type: "string", minLength: 1 }
    }
  },
  elementRef: ELEMENT_REF_DEF,
  functionRef: FUNCTION_REF_DEF,
  workflowRef: WORKFLOW_REF_DEF
});
var TARGET_SELECTOR_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["runtime", "module"],
  properties: {
    runtime: { const: "node" },
    module: { const: "esm" },
    nodeMajor: { type: "integer", minimum: 0 }
  }
};
var RESOLVED_TARGET_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["runtime", "module", "profile"],
  properties: {
    runtime: { const: "node" },
    module: { const: "esm" },
    nodeMajor: { type: "integer", minimum: 0 },
    profile: { const: NODE22_ESM_PROFILE }
  }
};
var PACKAGE_REF_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["package", "version"],
  properties: {
    package: { type: "string", minLength: 1 },
    version: { type: "string", pattern: SEMVER_PATTERN }
  }
};
var DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA = defsEnvelope("app-descriptor.json", {
  type: "object",
  additionalProperties: false,
  required: ["kind", "schemaVersion", "id", "version", "target", "roots", "extensions"],
  properties: {
    kind: { const: "DomainApp" },
    schemaVersion: { const: DH_APP_SCHEMA_VERSION },
    id: { type: "string", pattern: IDENTIFIER_PATTERN },
    version: { type: "string", pattern: SEMVER_PATTERN },
    target: TARGET_SELECTOR_DEF,
    roots: {
      type: "object",
      additionalProperties: false,
      required: ["kernelPrimary", "cores"],
      properties: {
        kernelPrimary: { $ref: "#/$defs/packageRef" },
        cores: { type: "array", items: { $ref: "#/$defs/packageRef" } }
      }
    },
    extensions: { type: "array", items: { $ref: "#/$defs/packageRef" } },
    config: { type: "object", additionalProperties: {} }
  }
}, {
  elementRef: ELEMENT_REF_DEF,
  functionRef: FUNCTION_REF_DEF,
  packageRef: PACKAGE_REF_DEF,
  targetSelector: TARGET_SELECTOR_DEF
});
var IMPLEMENTATION_LOCATOR_DEF = {
  type: "object",
  additionalProperties: false,
  required: ["module", "exportName"],
  properties: {
    module: { $ref: "#/$defs/resourceRef" },
    exportName: { type: "string", minLength: 1 }
  }
};
var DOMAIN_APP_LOCK_JSON_SCHEMA = defsEnvelope("app-lock.json", {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "schemaVersion",
    "appIdentity",
    "target",
    "selectedKdpHost",
    "selectedPackages",
    "selectedElements",
    "selectedFunctions",
    "hookBindings",
    "coreOrder",
    "resourceDigests",
    "excludedUnknownContent",
    "closureDigest"
  ],
  properties: {
    kind: { const: "DomainAppLock" },
    schemaVersion: { const: DH_LOCK_SCHEMA_VERSION },
    appIdentity: {
      type: "object",
      additionalProperties: false,
      required: ["id", "version", "descriptorDigest"],
      properties: {
        id: { type: "string", minLength: 1 },
        version: { type: "string", pattern: SEMVER_PATTERN },
        descriptorDigest: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 }
      }
    },
    target: { $ref: "#/$defs/resolvedTarget" },
    selectedKdpHost: {
      type: "object",
      additionalProperties: false,
      required: ["kdpPackageId", "kdpInitFunction", "invocationAbi", "kdpInitModule"],
      properties: {
        kdpPackageId: { type: "string", minLength: 1 },
        kdpInitFunction: { $ref: "#/$defs/functionRef" },
        invocationAbi: { const: "kdp-host-init/1" },
        kdpInitModule: { $ref: "#/$defs/resourceRef" }
      }
    },
    selectedPackages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["packageId", "version", "layer", "role", "artifact", "init", "initFunction", "initResources", "imports", "dependsOn"],
        properties: {
          packageId: { type: "string", minLength: 1 },
          version: { type: "string", pattern: SEMVER_PATTERN },
          layer: { enum: ["kernel", "sdk", "business"] },
          role: { enum: ["primary", "extension"] },
          artifact: { $ref: "#/$defs/resourceRef" },
          order: { type: "integer", minimum: 0 },
          init: { $ref: "#/$defs/elementRef" },
          initFunction: { $ref: "#/$defs/functionRef" },
          exit: { $ref: "#/$defs/elementRef" },
          exitFunction: { $ref: "#/$defs/functionRef" },
          initResources: { type: "array", items: { $ref: "#/$defs/resourceRef" } },
          imports: { type: "array", items: { $ref: "#/$defs/functionRef" } },
          workflowRoots: { type: "array", items: { $ref: "#/$defs/workflowRef" } },
          recordInitFrom: { const: true },
          dependsOn: { type: "array", items: { type: "string", minLength: 1 } }
        }
      }
    },
    selectedElements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "ownerPackageId", "visibility", "contentDigests", "contractDigests"],
        properties: {
          ref: { $ref: "#/$defs/elementRef" },
          ownerPackageId: { type: "string", minLength: 1 },
          visibility: { enum: ["public", "private"] },
          contentDigests: { type: "array", items: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 } },
          contractDigests: { type: "array", items: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 } }
        }
      }
    },
    selectedFunctions: {
      type: "array",
      items: {
        // 仅每个封闭的 oneOf 分支定义允许字段，外层禁止 additionalProperties:false
        // 否则与内层 properties 不共享声明，合法函数会被错误拒绝。
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["ref", "outcomes", "effects", "implementation", "resources"],
            properties: {
              ref: { $ref: "#/$defs/functionRef" },
              outcomes: {
                type: "array",
                minItems: 1,
                items: { enum: ["SUCCEEDED", "UNKNOWN", "FAILED"] },
                contains: { const: "SUCCEEDED" }
              },
              effects: { enum: ["none", "external", "state"] },
              implementation: { $ref: "#/$defs/implementationLocator" },
              resources: { type: "array", items: { $ref: "#/$defs/resourceRef" } }
            }
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["ref", "invocationAbi", "implementation", "resources"],
            properties: {
              ref: { $ref: "#/$defs/functionRef" },
              invocationAbi: { const: "kdp-host-init/1" },
              implementation: { $ref: "#/$defs/implementationLocator" },
              resources: { type: "array", items: { $ref: "#/$defs/resourceRef" } }
            }
          }
        ]
      }
    },
    trustedRuntimeIntegrity: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "version", "integrity"],
        properties: {
          name: { enum: ["xstate", "yaml"] },
          version: { type: "string", pattern: SEMVER_PATTERN },
          integrity: { type: "string", pattern: "^sha512-[A-Za-z0-9+/]+={0,2}$" }
        }
      }
    },
    selectedWorkflows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "ownerPackageId", "definitionDigest", "definition"],
        properties: {
          ref: { $ref: "#/$defs/workflowRef" },
          ownerPackageId: { type: "string", minLength: 1 },
          definitionDigest: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 },
          definition: { $ref: "#/$defs/workflowDefinition" }
        }
      }
    },
    hookBindings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ownerPackageId", "hookId", "cardinality", "providers"],
        properties: {
          ownerPackageId: { type: "string", minLength: 1 },
          hookId: { type: "string", minLength: 1 },
          cardinality: { enum: ["single", "multi"] },
          providers: { type: "array", items: { $ref: "#/$defs/functionRef" } }
        }
      }
    },
    coreOrder: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
    resourceDigests: {
      type: "object",
      propertyNames: { type: "string", minLength: 1 },
      additionalProperties: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 }
    },
    excludedUnknownContent: { type: "array", items: { type: "string", minLength: 1 } },
    closureDigest: { type: "string", pattern: CONTENT_DIGEST_PATTERN2 }
  }
}, {
  resourceRef: RESOURCE_REF_DEF,
  elementRef: ELEMENT_REF_DEF,
  functionRef: FUNCTION_REF_DEF,
  implementationLocator: IMPLEMENTATION_LOCATOR_DEF,
  resolvedTarget: RESOLVED_TARGET_DEF,
  workflowRef: WORKFLOW_REF_DEF,
  workflowDefinition: WORKFLOW_DEFINITION_DEF,
  workflowNode: WORKFLOW_NODE_DEF,
  workflowTarget: WORKFLOW_TARGET_DEF,
  workflowSwitch: WORKFLOW_SWITCH_DEF,
  workflowData: WORKFLOW_DATA_DEF,
  workflowHooks: WORKFLOW_HOOKS_DEF
});
var JSON_SCHEMAS = Object.freeze({
  "domain": DOMAIN_DEFINITION_JSON_SCHEMA,
  "element": ELEMENT_DEFINITION_JSON_SCHEMA,
  "content-block": CONTENT_BLOCK_JSON_SCHEMA,
  "function-contract": FUNCTION_CONTRACT_JSON_SCHEMA,
  "element-ref": ELEMENT_REF_JSON_SCHEMA,
  "function-ref": FUNCTION_REF_JSON_SCHEMA,
  "package-manifest": DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
  "app-descriptor": DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA,
  "app-lock": DOMAIN_APP_LOCK_JSON_SCHEMA,
  "workflow-definition": WORKFLOW_DEFINITION_JSON_SCHEMA
});

// packages/contracts/dist/error-codes.js
var BUILD_L201 = [
  "DH_BUILD_SCHEMA_UNKNOWN_REQUIRED",
  "DH_BUILD_SCHEMA_INVALID",
  "DH_BUILD_CONTENT_XOR",
  "DH_BUILD_ELEMENT_ID_INVALID",
  "DH_BUILD_OUTCOMES_INVALID",
  "DH_BUILD_ROLES_NON_DESCRIPTOR"
];
var BUILD_L202 = [
  "DH_BUILD_ELEMENT_DUPLICATE_OWNER",
  "DH_BUILD_EXPORT_MISSING",
  "DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION",
  "DH_BUILD_IMPLEMENTATION_MISSING",
  "DH_BUILD_VERSION_CONFLICT",
  "DH_BUILD_REF_UNRESOLVED",
  "DH_BUILD_EFFECT_PROFILE_UNSUPPORTED"
];
var BUILD_L203 = [
  "DH_BUILD_PRIMARY_DUPLICATE",
  "DH_BUILD_PRIMARY_MISSING",
  "DH_BUILD_HOOK_TARGET_INVALID",
  "DH_BUILD_HOOK_CARDINALITY",
  "DH_BUILD_LIFECYCLE_HALF",
  "DH_BUILD_DEPENDS_ON_UNSELECTED",
  "DH_BUILD_LAYER_ROLE_MISMATCH"
];
var BUILD_L204 = [
  "DH_BUILD_PACKAGE_CYCLE",
  "DH_BUILD_ELEMENT_CYCLE",
  "DH_BUILD_TARGET_INVALID",
  "DH_BUILD_RESOURCE_DIGEST_MISMATCH",
  "DH_BUILD_RESOURCE_MISSING",
  "DH_BUILD_LOCK_NOT_REPRODUCIBLE"
];
var BUILD_ERROR_CODES = Object.freeze([
  ...BUILD_L201,
  ...BUILD_L202,
  ...BUILD_L203,
  ...BUILD_L204
]);
var BOOT_ERROR_CODES = Object.freeze([
  "DH_BOOT_PIN_MISMATCH",
  "DH_BOOT_RECORD_MISSING",
  "DH_BOOT_RECORD_INVALID",
  "DH_BOOT_KDP_ENTRY_INVALID",
  "DH_KDP_PACKAGE_LOAD_FAILED"
]);
var RUNTIME_ERROR_CODES = Object.freeze([
  "DH_RUNTIME_FUNCTION_UNSELECTED",
  "DH_RUNTIME_INPUT_SCHEMA_MISMATCH",
  "DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH",
  "DH_RUNTIME_NOT_READY",
  "DH_RUNTIME_DISPOSE_AFTER_FAILURE",
  "DH_RUNTIME_UNSUPPORTED_PROFILE"
]);
var KNOWN_ERROR_CODES = Object.freeze([
  ...BUILD_ERROR_CODES,
  ...BOOT_ERROR_CODES,
  ...RUNTIME_ERROR_CODES
]);

// packages/contracts/dist/errors.js
var DomainHarnessError = class extends globalThis.Error {
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "DomainHarnessError";
    this.code = code;
  }
};

// examples/reference-domain-app/packages/r41-kdp/src/paths.ts
import * as nodePath from "node:path";
var INSTALLED_RECORD_RELATIVE_PATH = "dh-install/installed-record.json";
var PACKAGE_ID_PATTERN = /^(@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/u;
function isWellFormedPackageId(value) {
  return typeof value === "string" && PACKAGE_ID_PATTERN.test(value);
}
function splitResourceKey(key) {
  let separator = key.length;
  while ((separator = key.lastIndexOf("/", separator - 1)) > 0) {
    const packageId = key.slice(0, separator);
    const path = key.slice(separator + 1);
    if (path.length > 0 && isWellFormedPackageId(packageId)) {
      return { packageId, path };
    }
  }
  return null;
}
function resolveInRoot(root, relativePosixPath) {
  if (typeof relativePosixPath !== "string" || relativePosixPath.length === 0) return null;
  if (relativePosixPath.includes("\\")) return null;
  if (nodePath.isAbsolute(relativePosixPath) || /^[A-Za-z]:/u.test(relativePosixPath)) {
    return null;
  }
  const segments = relativePosixPath.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return null;
  }
  const absolute = nodePath.resolve(root, ...segments);
  const rel = nodePath.relative(root, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${nodePath.sep}`) || nodePath.isAbsolute(rel)) {
    return null;
  }
  return absolute;
}
function resolvePackageFile(installRoot, packageId, path) {
  if (!isWellFormedPackageId(packageId)) return null;
  const packageRoot = resolveInRoot(installRoot, `node_modules/${packageId}`);
  if (packageRoot === null) return null;
  return resolveInRoot(packageRoot, path);
}
function sameResolvedFile(root, a, b) {
  const resolvedA = resolveInRoot(root, a);
  const resolvedB = resolveInRoot(root, b);
  return resolvedA !== null && resolvedA === resolvedB;
}

// examples/reference-domain-app/packages/r41-kdp/src/verify.ts
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, relative as relative2, resolve as resolve2 } from "node:path";
import { createHash as createHash2 } from "node:crypto";
function trustFailure(code, reason) {
  return { code, reason };
}
function sha256OfBytes(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}
function bytesContentDigest(bytes) {
  return `sha256:${sha256OfBytes(bytes)}`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
function isSemVerLike(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/u.test(value);
}
function validateRecordShape(raw) {
  if (raw["kind"] !== "DomainAppInstallRecord") {
    return `record kind must be 'DomainAppInstallRecord'`;
  }
  if (raw["schemaVersion"] !== DH_INSTALL_RECORD_SCHEMA_VERSION) {
    return `record schemaVersion must be '${DH_INSTALL_RECORD_SCHEMA_VERSION}'`;
  }
  if (!isNonEmptyString(raw["appId"])) return "record appId must be a non-empty string";
  if (!isSemVerLike(raw["appVersion"])) return "record appVersion must be MAJOR.MINOR.PATCH";
  if (!isRecord(raw["target"])) return "record target must be an object";
  if (!isNonEmptyString(raw["lockPath"])) return "record lockPath must be a non-empty string";
  if (!isContentDigest(raw["lockDigest"])) return "record lockDigest must be sha256:<64 lowercase hex>";
  if (!isWellFormedPackageId(raw["kdpPackageId"])) return "record kdpPackageId is not a well-formed package id";
  if (raw["invocationAbi"] !== "kdp-host-init/1") return "record invocationAbi must be kdp-host-init/1";
  const selectedInit = raw["kdpInitFunction"];
  if (!isRecord(selectedInit) || !isRecord(selectedInit["element"]) || selectedInit["functionId"] !== "init" || selectedInit["contractVersion"] !== "1") {
    return "record kdpInitFunction must identify the selected Kernel Init Function";
  }
  const module = raw["kdpInitModule"];
  if (!isRecord(module) || module["packageId"] !== raw["kdpPackageId"] || !isContentDigest(module["digest"]) || typeof module["path"] !== "string") {
    return "record kdpInitModule must be the selected KDP Target ResourceRef";
  }
  if (!isContentDigest(raw["recordDigest"])) return "record recordDigest must be sha256:<64 lowercase hex>";
  return null;
}
async function readTrustedRecord(installRoot) {
  if (typeof installRoot !== "string" || installRoot.length === 0) {
    return {
      ok: false,
      failure: trustFailure("DH_BOOT_RECORD_MISSING", "installRoot is missing or not a string; no trusted install can be addressed")
    };
  }
  const recordPath = resolveInRoot(installRoot, INSTALLED_RECORD_RELATIVE_PATH);
  if (recordPath === null) {
    return {
      ok: false,
      failure: trustFailure("DH_BOOT_RECORD_MISSING", `cannot address ${INSTALLED_RECORD_RELATIVE_PATH} under installRoot`)
    };
  }
  let text;
  try {
    text = await readFile(recordPath, "utf8");
  } catch {
    return {
      ok: false,
      failure: trustFailure("DH_BOOT_RECORD_MISSING", `trusted installed record not readable at ${INSTALLED_RECORD_RELATIVE_PATH}`)
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      failure: trustFailure("DH_BOOT_RECORD_MISSING", `trusted installed record is not parseable JSON at ${INSTALLED_RECORD_RELATIVE_PATH}`)
    };
  }
  if (!isRecord(parsed)) {
    return { ok: false, failure: trustFailure("DH_BOOT_RECORD_INVALID", "installed record is not a JSON object") };
  }
  const shapeError = validateRecordShape(parsed);
  if (shapeError !== null) {
    return { ok: false, failure: trustFailure("DH_BOOT_RECORD_INVALID", shapeError) };
  }
  const { recordDigest, ...withoutDigest } = parsed;
  let actualDigest;
  try {
    actualDigest = contentDigestOf(withoutDigest);
  } catch {
    return { ok: false, failure: trustFailure("DH_BOOT_RECORD_INVALID", "installed record contains non-canonical JSON data") };
  }
  if (actualDigest !== recordDigest) {
    return {
      ok: false,
      failure: trustFailure("DH_BOOT_RECORD_INVALID", "recordDigest does not match the canonical record without recordDigest")
    };
  }
  return { ok: true, value: parsed };
}
function verifyContextPaths(context, record) {
  if (typeof context.installRoot !== "string" || context.installRoot.length === 0) {
    return trustFailure("DH_BOOT_RECORD_MISSING", "installRoot is missing or not a string; no trusted install can be addressed");
  }
  if (!sameResolvedFile(context.installRoot, context.lockPath, record.lockPath)) {
    return trustFailure("DH_BOOT_PIN_MISMATCH", "context.lockPath does not resolve to the installed record lockPath inside installRoot");
  }
  if (typeof context.descriptorPath !== "string" || resolveInRoot(context.installRoot, context.descriptorPath) === null) {
    return trustFailure("DH_BOOT_PIN_MISMATCH", "context.descriptorPath is not an in-root relative path");
  }
  return null;
}
function findOrderZeroCore(lock) {
  return lock.selectedPackages.find((candidate) => candidate.packageId === lock.coreOrder[0] && candidate.role === "primary" && candidate.order === 0);
}
async function verifyLockAgainstRecord(installRoot, record) {
  const lockPath = resolveInRoot(installRoot, record.lockPath);
  if (lockPath === null) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", `installed record lockPath '${record.lockPath}' is not an in-root relative path`) };
  }
  let bytes;
  try {
    bytes = await readFile(lockPath);
  } catch {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", `locked Lock file '${record.lockPath}' is not readable under installRoot`) };
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", `locked Lock file '${record.lockPath}' is not parseable JSON`) };
  }
  if (!isRecord(parsed) || !isContentDigest(parsed["closureDigest"])) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "locked Lock file has no valid closureDigest field") };
  }
  const { closureDigest, ...preimage } = parsed;
  let actualDigest;
  try {
    actualDigest = contentDigestOf(preimage);
  } catch {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Lock contains non-canonical JSON data") };
  }
  if (actualDigest !== closureDigest) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Lock closureDigest recomputation failed (one-byte tamper is refused here)") };
  }
  if (closureDigest !== record.lockDigest) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Lock closureDigest does not equal the installed record lockDigest") };
  }
  if (parsed["kind"] !== "DomainAppLock" || parsed["schemaVersion"] !== DH_LOCK_SCHEMA_VERSION) {
    return { ok: false, failure: trustFailure(
      "DH_BOOT_PIN_MISMATCH",
      `Lock machine contract must use '${DH_LOCK_SCHEMA_VERSION}', no legacy Lock format is accepted`
    ) };
  }
  const lock = parsed;
  if (!Array.isArray(lock.coreOrder) || !Array.isArray(lock.selectedPackages) || !lock.selectedPackages.every((candidate) => isRecord(candidate) && isRecord(candidate["init"]) && isRecord(candidate["initFunction"]) && isRecord(candidate["artifact"]) && typeof candidate["packageId"] === "string")) {
    return { ok: false, failure: trustFailure(
      "DH_BOOT_PIN_MISMATCH",
      "Lock coreOrder or selectedPackages lacks required selected lifecycle identities"
    ) };
  }
  if (!Array.isArray(lock.selectedFunctions) || !lock.selectedFunctions.every((candidate) => isRecord(candidate) && isRecord(candidate["ref"]) && isRecord(candidate["implementation"]) && isRecord(candidate["implementation"]["module"])) || !Array.isArray(lock.selectedElements) || !lock.selectedElements.every((candidate) => isRecord(candidate) && isRecord(candidate["ref"]))) {
    return { ok: false, failure: trustFailure(
      "DH_BOOT_PIN_MISMATCH",
      "Lock selectedFunctions/selectedElements has malformed machine identities"
    ) };
  }
  if (!isRecord(lock.target) || typeof lock.target["profile"] !== "string") {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Lock target is malformed (expected an object with a profile string)") };
  }
  if (!isRecord(lock.selectedKdpHost) || typeof lock.selectedKdpHost["kdpPackageId"] !== "string" || !isRecord(lock.selectedKdpHost["kdpInitFunction"]) || !isRecord(lock.selectedKdpHost["kdpInitFunction"]["element"]) || lock.selectedKdpHost["invocationAbi"] !== "kdp-host-init/1" || !isRecord(lock.selectedKdpHost["kdpInitModule"])) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Lock selectedKdpHost is malformed (expected selected KDP FunctionRef, ABI and Target ResourceRef)") };
  }
  if (!isRecord(lock.appIdentity) || typeof lock.appIdentity["descriptorDigest"] !== "string") {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Lock appIdentity is malformed (expected a descriptorDigest string)") };
  }
  if (lock.selectedKdpHost.kdpPackageId !== record.kdpPackageId || canonicalJson(lock.selectedKdpHost.kdpInitFunction) !== canonicalJson(record.kdpInitFunction) || lock.selectedKdpHost.invocationAbi !== record.invocationAbi || canonicalJson(lock.selectedKdpHost.kdpInitModule) !== canonicalJson(record.kdpInitModule)) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Lock selectedKdpHost disagrees with the installed record") };
  }
  const orderZero = findOrderZeroCore(lock);
  if (lock.coreOrder[0] !== lock.selectedKdpHost.kdpPackageId || !orderZero) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "Order 0 Core and selected KDP Package identities differ") };
  }
  const verifiedLock = parsed;
  const initRef = verifiedLock.selectedKdpHost.kdpInitFunction;
  const matching = verifiedLock.selectedFunctions.filter((candidate) => canonicalJson(candidate.ref) === canonicalJson(initRef));
  const target = matching[0];
  const selectedElement = verifiedLock.selectedElements.find((candidate) => canonicalJson(candidate.ref) === canonicalJson(initRef.element));
  if (!Array.isArray(matching) || matching.length !== 1 || verifiedLock.selectedFunctions.filter((fn) => fn.invocationAbi === "kdp-host-init/1").length !== 1 || initRef.functionId !== "init" || initRef.contractVersion !== "1" || canonicalJson(orderZero.init) !== canonicalJson(initRef.element) || canonicalJson(orderZero.initFunction) !== canonicalJson(initRef) || selectedElement?.ownerPackageId !== orderZero.packageId || target?.invocationAbi !== "kdp-host-init/1" || target.implementation.module.packageId !== orderZero.packageId || canonicalJson(target.implementation.module) !== canonicalJson(lock.selectedKdpHost.kdpInitModule)) {
    return { ok: false, failure: trustFailure(
      "DH_BOOT_PIN_MISMATCH",
      "Lock selected Kernel Init Function/Target does not exactly match the privileged Host ABI and Order 0 owner"
    ) };
  }
  return { ok: true, value: lock };
}
function resolveConditionalExports(value) {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    for (const condition of ["node", "import", "default"]) {
      if (hasOwn(value, condition)) {
        const resolved = resolveConditionalExports(value[condition]);
        if (resolved !== null) return resolved;
      }
    }
  }
  return null;
}
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
async function resolveKdpEntryPath(installRoot, kdpPackageId) {
  const invalid = (reason) => ({
    ok: false,
    failure: trustFailure("DH_BOOT_KDP_ENTRY_INVALID", reason)
  });
  const manifestPath = resolvePackageFile(installRoot, kdpPackageId, "package.json");
  if (manifestPath === null) {
    return invalid(`KDP package '${kdpPackageId}' manifest cannot be addressed under installRoot`);
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return invalid(`KDP package '${kdpPackageId}' manifest is not readable parseable JSON`);
  }
  if (!isRecord(manifest)) {
    return invalid(`KDP package '${kdpPackageId}' manifest is not a JSON object`);
  }
  let dot;
  if (hasOwn(manifest, "exports")) {
    const exportsField = manifest["exports"];
    if (typeof exportsField === "string") {
      dot = exportsField;
    } else if (isRecord(exportsField) && hasOwn(exportsField, ".")) {
      dot = exportsField["."];
    } else {
      return invalid(`KDP package '${kdpPackageId}' exports map has no '.' entry`);
    }
  } else {
    dot = manifest["main"];
  }
  const entry = resolveConditionalExports(dot);
  if (entry === null || !entry.startsWith("./")) {
    return invalid(
      `KDP package '${kdpPackageId}' entry cannot be resolved from node/import/default conditions (detail redacted)`
    );
  }
  const resolved = resolvePackageFile(installRoot, kdpPackageId, entry.slice(2));
  if (resolved === null) {
    return invalid(`KDP package '${kdpPackageId}' entry '${entry}' is not an in-package relative path`);
  }
  return { ok: true, value: resolved };
}
async function verifySealedKdpLocation(installRoot, packageId, entryPath) {
  const manifestPath = resolvePackageFile(installRoot, packageId, "package.json");
  if (manifestPath === null) {
    return trustFailure("DH_BOOT_PIN_MISMATCH", "sealed KDP package path is invalid");
  }
  try {
    const trustedRoot = await realpath(installRoot);
    const installedRoot = resolve2(trustedRoot, "node_modules", ...packageId.split("/"));
    const sealedLocalRoot = resolve2(trustedRoot, "packages", ...packageId.split("/"));
    const actualRoot = await realpath(dirname(manifestPath));
    if (relative2(installedRoot, actualRoot) !== "" && relative2(sealedLocalRoot, actualRoot) !== "") {
      return trustFailure("DH_BOOT_PIN_MISMATCH", "sealed KDP package root is outside its selected installation locations");
    }
    if (entryPath !== void 0) {
      const logicalRoot = dirname(manifestPath);
      const withinPackage = relative2(logicalRoot, entryPath);
      if (withinPackage === "" || withinPackage === ".." || withinPackage.startsWith("../") || withinPackage.startsWith("..\\")) {
        return trustFailure("DH_BOOT_PIN_MISMATCH", "sealed KDP entry is outside its package");
      }
      const expectedEntry = resolve2(actualRoot, withinPackage);
      const actualEntry = await realpath(entryPath);
      if (relative2(expectedEntry, actualEntry) !== "") {
        return trustFailure("DH_BOOT_PIN_MISMATCH", "sealed KDP entry was redirected by a link");
      }
    }
  } catch {
    return trustFailure("DH_BOOT_PIN_MISMATCH", "sealed KDP installation path is not readable");
  }
  return null;
}
async function verifySdkLookupPath(installRoot, selectedKdpEntry) {
  let trustedRoot;
  let realEntry;
  try {
    trustedRoot = await realpath(installRoot);
    realEntry = await realpath(selectedKdpEntry);
  } catch {
    return trustFailure(
      "DH_BOOT_PIN_MISMATCH",
      "trusted SDK source lookup cannot be verified for this installation"
    );
  }
  const sdkOwners = [
    "@kaicreator/domain-harness",
    "@kaicreator/domain-harness-microkernel",
    "@kaicreator/domain-harness-contracts"
  ];
  let cursor = dirname(realEntry);
  while (cursor !== trustedRoot) {
    const rel = relative2(trustedRoot, cursor);
    if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\")) {
      return trustFailure("DH_BOOT_PIN_MISMATCH", "selected KDP entry escapes the trusted install root");
    }
    for (const name of sdkOwners) {
      const shadow = resolve2(cursor, "node_modules", ...name.split("/"));
      try {
        await lstat(shadow);
        return trustFailure(
          "DH_BOOT_PIN_MISMATCH",
          "selected KDP could resolve a shadow SDK package outside the trusted top-level installation"
        );
      } catch (error) {
        if (error.code !== "ENOENT") {
          return trustFailure(
            "DH_BOOT_PIN_MISMATCH",
            "cannot establish that the selected KDP resolves only trusted SDK package locations"
          );
        }
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      return trustFailure("DH_BOOT_PIN_MISMATCH", "selected KDP has no trusted SDK resolution boundary");
    }
    cursor = parent;
  }
  return null;
}
async function verifyKdpEntryBytes(installRoot, record, lock) {
  const physicalRootFailure = await verifySealedKdpLocation(installRoot, record.kdpPackageId);
  if (physicalRootFailure !== null) return { ok: false, failure: physicalRootFailure };
  const manifestPath = resolvePackageFile(installRoot, record.kdpPackageId, "package.json");
  const manifestDigest = lock.resourceDigests[`${record.kdpPackageId}/package.json`];
  if (manifestPath === null || manifestDigest === void 0) {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "KDP package.json is not sealed in the Lock") };
  }
  try {
    const bytes2 = await readFile(manifestPath);
    if (bytesContentDigest(bytes2) !== manifestDigest) {
      return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "KDP package.json bytes do not match the sealed digest") };
    }
  } catch {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "KDP package.json is not readable") };
  }
  const entryResult = await resolveKdpEntryPath(installRoot, record.kdpPackageId);
  if (!entryResult.ok) return entryResult;
  const entryPath = entryResult.value;
  const selectedModule = lock.selectedKdpHost.kdpInitModule;
  const selectedPath = resolvePackageFile(installRoot, selectedModule.packageId, selectedModule.path);
  if (!selectedPath || selectedModule.packageId !== record.kdpPackageId || selectedPath !== entryPath) {
    return { ok: false, failure: trustFailure(
      "DH_BOOT_PIN_MISMATCH",
      "KDP package root export does not equal the Lock-selected Host Function module path"
    ) };
  }
  const physicalEntryFailure = await verifySealedKdpLocation(installRoot, record.kdpPackageId, entryPath);
  if (physicalEntryFailure !== null) return { ok: false, failure: physicalEntryFailure };
  const lookupFailure = await verifySdkLookupPath(installRoot, entryPath);
  if (lookupFailure !== null) return { ok: false, failure: lookupFailure };
  let bytes;
  try {
    bytes = await readFile(entryPath);
  } catch {
    return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", `KDP entry artifact for '${record.kdpPackageId}' is not readable`) };
  }
  if (bytesContentDigest(bytes) !== selectedModule.digest || bytesContentDigest(bytes) !== record.kdpInitModule.digest || lock.resourceDigests[`${record.kdpPackageId}/${selectedModule.path}`] !== selectedModule.digest) {
    return { ok: false, failure: trustFailure(
      "DH_BOOT_PIN_MISMATCH",
      "selected KDP Host Function module bytes do not match the Lock/Record/ResourceRef digest"
    ) };
  }
  return { ok: true, value: entryPath };
}
function normalizeBootstrapContext(context) {
  if (!isRecord(context)) {
    return {
      ok: false,
      failure: trustFailure("DH_BOOT_RECORD_MISSING", "bootstrap context is missing or not an object")
    };
  }
  try {
    const installRoot = context["installRoot"];
    if (typeof installRoot !== "string" || installRoot.length === 0) {
      return {
        ok: false,
        failure: trustFailure("DH_BOOT_RECORD_MISSING", "installRoot is missing or not a string; no trusted install can be addressed")
      };
    }
    const lockPath = context["lockPath"];
    const descriptorPath = context["descriptorPath"];
    if (typeof lockPath !== "string" || lockPath.length === 0) {
      return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "context.lockPath is missing or not a string") };
    }
    if (typeof descriptorPath !== "string" || descriptorPath.length === 0) {
      return { ok: false, failure: trustFailure("DH_BOOT_PIN_MISMATCH", "context.descriptorPath is missing or not a string") };
    }
    const hostPortsRaw = context["hostPorts"];
    const hostPorts = Array.isArray(hostPortsRaw) ? hostPortsRaw.filter(
      (entry) => isRecord(entry) && typeof entry["name"] === "string" && typeof entry["port"] === "number"
    ) : [];
    const envRaw = context["env"];
    const env = isRecord(envRaw) && typeof envRaw["nodeMajor"] === "number" && typeof envRaw["platform"] === "string" ? { nodeMajor: envRaw["nodeMajor"], platform: envRaw["platform"] } : { nodeMajor: 0, platform: "unknown" };
    const lifecycleRaw = context["processLifecycle"];
    if (lifecycleRaw !== void 0 && (!isRecord(lifecycleRaw) || lifecycleRaw["timeoutMs"] !== void 0 && (typeof lifecycleRaw["timeoutMs"] !== "number" || !Number.isFinite(lifecycleRaw["timeoutMs"]) || lifecycleRaw["timeoutMs"] <= 0))) {
      return {
        ok: false,
        failure: trustFailure("DH_BOOT_PIN_MISMATCH", "processLifecycle must contain a positive finite timeoutMs when provided")
      };
    }
    const processLifecycle = isRecord(lifecycleRaw) ? { ...typeof lifecycleRaw["timeoutMs"] === "number" ? { timeoutMs: lifecycleRaw["timeoutMs"] } : {} } : void 0;
    return {
      ok: true,
      value: { installRoot, descriptorPath, lockPath, hostPorts, env, ...processLifecycle ? { processLifecycle } : {} }
    };
  } catch {
    return {
      ok: false,
      failure: trustFailure("DH_BOOT_RECORD_MISSING", "bootstrap context could not be read (detail redacted)")
    };
  }
}
async function verifyInstallTrust(context) {
  const normalized = normalizeBootstrapContext(context);
  if (!normalized.ok) return normalized;
  const recordResult = await readTrustedRecord(normalized.value.installRoot);
  if (!recordResult.ok) return recordResult;
  const pathFailure = verifyContextPaths(normalized.value, recordResult.value);
  if (pathFailure !== null) return { ok: false, failure: pathFailure };
  const installRoot = normalized.value.installRoot;
  const lockResult = await verifyLockAgainstRecord(installRoot, recordResult.value);
  if (!lockResult.ok) return lockResult;
  const entryResult = await verifyKdpEntryBytes(installRoot, recordResult.value, lockResult.value);
  if (!entryResult.ok) return entryResult;
  return {
    ok: true,
    value: {
      record: recordResult.value,
      lock: lockResult.value,
      entryPath: entryResult.value,
      context: normalized.value
    }
  };
}

// examples/reference-domain-app/packages/r41-kdp/src/schema-subset.ts
function validateJsonSubset(instance, schema) {
  if (instance === void 0 || typeof instance === "function" || typeof instance === "symbol" || typeof instance === "bigint") {
    return false;
  }
  if (typeof instance === "number" && !Number.isFinite(instance)) return false;
  if (Array.isArray(instance)) {
    for (let index = 0; index < instance.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(instance, index)) return false;
    }
  }
  if (typeof schema === "boolean") return schema;
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return false;
  const s = schema;
  if ("const" in s && !deepJsonEqual(instance, s["const"])) return false;
  if ("enum" in s) {
    const values = s["enum"];
    if (!Array.isArray(values) || !values.some((option) => deepJsonEqual(instance, option))) {
      return false;
    }
  }
  if ("type" in s && !matchesType(instance, s["type"])) return false;
  if (typeof instance === "number") {
    if (typeof s["minimum"] === "number" && instance < s["minimum"]) return false;
    if (typeof s["maximum"] === "number" && instance > s["maximum"]) return false;
    if (s["exclusiveMinimum"] === true && typeof s["minimum"] === "number" && instance <= s["minimum"]) {
      return false;
    }
    if (typeof s["exclusiveMinimum"] === "number" && instance <= s["exclusiveMinimum"]) return false;
    if (typeof s["exclusiveMaximum"] === "number" && instance >= s["exclusiveMaximum"]) return false;
    if (typeof s["multipleOf"] === "number" && s["multipleOf"] > 0 && !Number.isInteger(instance / s["multipleOf"])) {
      return false;
    }
  }
  if (typeof instance === "string") {
    if (typeof s["minLength"] === "number" || typeof s["maxLength"] === "number") {
      const codePointLength = [...instance].length;
      if (typeof s["minLength"] === "number" && codePointLength < s["minLength"]) return false;
      if (typeof s["maxLength"] === "number" && codePointLength > s["maxLength"]) return false;
    }
    if (typeof s["pattern"] === "string") {
      try {
        if (!new RegExp(s["pattern"], "u").test(instance)) return false;
      } catch {
        return false;
      }
    }
  }
  if (Array.isArray(instance)) {
    if (typeof s["minItems"] === "number" && instance.length < s["minItems"]) return false;
    if (typeof s["maxItems"] === "number" && instance.length > s["maxItems"]) return false;
    const items = s["items"];
    if (items !== void 0) {
      if (Array.isArray(items)) return false;
      if (!instance.every((item) => validateJsonSubset(item, items))) return false;
    }
    const prefixItems = s["prefixItems"];
    if (Array.isArray(prefixItems)) {
      for (let index = 0; index < prefixItems.length && index < instance.length; index += 1) {
        if (!validateJsonSubset(instance[index], prefixItems[index])) return false;
      }
      if (s["items"] === false && instance.length > prefixItems.length) return false;
    }
    if (s["uniqueItems"] === true) {
      const seen = /* @__PURE__ */ new Set();
      for (const item of instance) {
        const key = stableStringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
      }
    }
  }
  if (typeof instance === "object" && instance !== null && !Array.isArray(instance)) {
    const objectInstance = instance;
    const required = s["required"];
    if (Array.isArray(required)) {
      for (const key of required) {
        if (typeof key === "string" && !hasOwn2(objectInstance, key)) return false;
      }
    }
    const properties = s["properties"];
    if (isPlainObject(properties)) {
      for (const [key, subschema] of Object.entries(properties)) {
        if (hasOwn2(objectInstance, key) && !validateJsonSubset(objectInstance[key], subschema)) return false;
      }
    }
    const additional = s["additionalProperties"];
    if (additional === false) {
      for (const key of Object.keys(objectInstance)) {
        const declared = isPlainObject(properties) && hasOwn2(properties, key);
        if (!declared) return false;
      }
    } else if (isPlainObject(additional)) {
      for (const key of Object.keys(objectInstance)) {
        const declared = isPlainObject(properties) && hasOwn2(properties, key);
        if (!declared && !validateJsonSubset(objectInstance[key], additional)) return false;
      }
    }
    const minProperties = s["minProperties"];
    const maxProperties = s["maxProperties"];
    if (typeof minProperties === "number" && Object.keys(objectInstance).length < minProperties) return false;
    if (typeof maxProperties === "number" && Object.keys(objectInstance).length > maxProperties) return false;
  }
  if (Array.isArray(s["allOf"]) && !s["allOf"].every((sub) => validateJsonSubset(instance, sub))) return false;
  if (Array.isArray(s["anyOf"]) && !s["anyOf"].some((sub) => validateJsonSubset(instance, sub))) return false;
  if (Array.isArray(s["oneOf"])) {
    const matches = s["oneOf"].filter((sub) => validateJsonSubset(instance, sub)).length;
    if (matches !== 1) return false;
  }
  if ("not" in s && validateJsonSubset(instance, s["not"])) return false;
  return true;
}
function matchesType(instance, type) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((single) => {
    switch (single) {
      case "null":
        return instance === null;
      case "boolean":
        return typeof instance === "boolean";
      case "number":
        return typeof instance === "number";
      case "integer":
        return typeof instance === "number" && Number.isInteger(instance);
      case "string":
        return typeof instance === "string";
      case "array":
        return Array.isArray(instance);
      case "object":
        return typeof instance === "object" && instance !== null && !Array.isArray(instance);
      default:
        return false;
    }
  });
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOwn2(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function isPlainJsonValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index) || !isPlainJsonValue(value[index])) return false;
    }
    return true;
  }
  if (isPlainObject(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value).every(isPlainJsonValue);
  }
  return false;
}
function deepJsonEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => deepJsonEqual(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every((key) => hasOwn2(b, key) && deepJsonEqual(a[key], b[key]));
  }
  return false;
}
function stableStringify(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    const body = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",");
    return `{${body}}`;
  }
  throw new Error("stableStringify received a non-JSON value");
}

// examples/reference-domain-app/packages/r41-kdp/src/package-system.ts
import { readFile as readFile2 } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// node_modules/xstate/dist/xstate-dev.esm.js
function getGlobal() {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  if (typeof self !== "undefined") {
    return self;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof global !== "undefined") {
    return global;
  }
}
function getDevTools() {
  const w = getGlobal();
  if (w.__xstate__) {
    return w.__xstate__;
  }
  return void 0;
}
var devToolsAdapter = (service) => {
  if (typeof window === "undefined") {
    return;
  }
  const devTools = getDevTools();
  if (devTools) {
    devTools.register(service);
  }
};

// node_modules/xstate/dist/raise-97446fd4.esm.js
var Mailbox = class {
  constructor(_process) {
    this._process = _process;
    this._active = false;
    this._current = null;
    this._last = null;
  }
  start() {
    this._active = true;
    this.flush();
  }
  clear() {
    if (this._current) {
      this._current.next = null;
      this._last = this._current;
    }
  }
  enqueue(event) {
    const enqueued = {
      value: event,
      next: null
    };
    if (this._current) {
      this._last.next = enqueued;
      this._last = enqueued;
      return;
    }
    this._current = enqueued;
    this._last = enqueued;
    if (this._active) {
      this.flush();
    }
  }
  flush() {
    while (this._current) {
      const consumed = this._current;
      this._process(consumed.value);
      this._current = consumed.next;
    }
    this._last = null;
  }
};
var XSTATE_INIT = "xstate.init";
var XSTATE_STOP = "xstate.stop";
function createDoneActorEvent(invokeId, output) {
  return {
    type: `xstate.done.actor.${invokeId}`,
    output,
    actorId: invokeId
  };
}
function createErrorActorEvent(id, error) {
  return {
    type: `xstate.error.actor.${id}`,
    error,
    actorId: id
  };
}
function createInitEvent(input) {
  return {
    type: XSTATE_INIT,
    input
  };
}
function reportUnhandledError(err) {
  setTimeout(() => {
    throw err;
  });
}
var symbolObservable = (() => typeof Symbol === "function" && Symbol.observable || "@@observable")();
function toObserver(nextHandler, errorHandler, completionHandler) {
  const isObserver = typeof nextHandler === "object";
  const self2 = isObserver ? nextHandler : void 0;
  return {
    next: (isObserver ? nextHandler.next : nextHandler)?.bind(self2),
    error: (isObserver ? nextHandler.error : errorHandler)?.bind(self2),
    complete: (isObserver ? nextHandler.complete : completionHandler)?.bind(self2)
  };
}
function createScheduledEventId(actorRef, id) {
  return `${actorRef.sessionId}.${id}`;
}
var idCounter = 0;
function createSystem(rootActor, options) {
  const children = /* @__PURE__ */ new Map();
  const keyedActors = /* @__PURE__ */ new Map();
  const reverseKeyedActors = /* @__PURE__ */ new WeakMap();
  const inspectionObservers = /* @__PURE__ */ new Set();
  const timerMap = {};
  const {
    clock,
    logger
  } = options;
  const scheduler = {
    schedule: (source, target, event, delay, id = Math.random().toString(36).slice(2)) => {
      const scheduledEvent = {
        source,
        target,
        event,
        delay,
        id,
        startedAt: Date.now()
      };
      const scheduledEventId = createScheduledEventId(source, id);
      system._snapshot._scheduledEvents[scheduledEventId] = scheduledEvent;
      const timeout = clock.setTimeout(() => {
        delete timerMap[scheduledEventId];
        delete system._snapshot._scheduledEvents[scheduledEventId];
        system._relay(source, target, event);
      }, delay);
      timerMap[scheduledEventId] = timeout;
    },
    cancel: (source, id) => {
      const scheduledEventId = createScheduledEventId(source, id);
      const timeout = timerMap[scheduledEventId];
      delete timerMap[scheduledEventId];
      delete system._snapshot._scheduledEvents[scheduledEventId];
      if (timeout !== void 0) {
        clock.clearTimeout(timeout);
      }
    },
    cancelAll: (actorRef) => {
      for (const scheduledEventId in system._snapshot._scheduledEvents) {
        const scheduledEvent = system._snapshot._scheduledEvents[scheduledEventId];
        if (scheduledEvent.source === actorRef) {
          scheduler.cancel(actorRef, scheduledEvent.id);
        }
      }
    }
  };
  const sendInspectionEvent = (event) => {
    if (!inspectionObservers.size) {
      return;
    }
    const resolvedInspectionEvent = {
      ...event,
      rootId: rootActor.sessionId
    };
    inspectionObservers.forEach((observer) => observer.next?.(resolvedInspectionEvent));
  };
  const system = {
    _snapshot: {
      _scheduledEvents: (options?.snapshot && options.snapshot.scheduler) ?? {}
    },
    _bookId: () => `x:${idCounter++}`,
    _register: (sessionId, actorRef) => {
      children.set(sessionId, actorRef);
      return sessionId;
    },
    _unregister: (actorRef) => {
      children.delete(actorRef.sessionId);
      const systemId = reverseKeyedActors.get(actorRef);
      if (systemId !== void 0) {
        keyedActors.delete(systemId);
        reverseKeyedActors.delete(actorRef);
      }
    },
    get: (systemId) => {
      return keyedActors.get(systemId);
    },
    getAll: () => {
      return Object.fromEntries(keyedActors.entries());
    },
    _set: (systemId, actorRef) => {
      const existing = keyedActors.get(systemId);
      if (existing && existing !== actorRef) {
        throw new Error(`Actor with system ID '${systemId}' already exists.`);
      }
      keyedActors.set(systemId, actorRef);
      reverseKeyedActors.set(actorRef, systemId);
    },
    inspect: (observerOrFn) => {
      const observer = toObserver(observerOrFn);
      inspectionObservers.add(observer);
      return {
        unsubscribe() {
          inspectionObservers.delete(observer);
        }
      };
    },
    _sendInspectionEvent: sendInspectionEvent,
    _relay: (source, target, event) => {
      system._sendInspectionEvent({
        type: "@xstate.event",
        sourceRef: source,
        actorRef: target,
        event
      });
      target._send(event);
    },
    scheduler,
    getSnapshot: () => {
      return {
        _scheduledEvents: {
          ...system._snapshot._scheduledEvents
        }
      };
    },
    start: () => {
      const scheduledEvents = system._snapshot._scheduledEvents;
      system._snapshot._scheduledEvents = {};
      for (const scheduledId in scheduledEvents) {
        const {
          source,
          target,
          event,
          delay,
          id
        } = scheduledEvents[scheduledId];
        scheduler.schedule(source, target, event, delay, id);
      }
    },
    _clock: clock,
    _logger: logger
  };
  return system;
}
var executingCustomAction = false;
var $$ACTOR_TYPE = 1;
var ProcessingStatus = /* @__PURE__ */ (function(ProcessingStatus2) {
  ProcessingStatus2[ProcessingStatus2["NotStarted"] = 0] = "NotStarted";
  ProcessingStatus2[ProcessingStatus2["Running"] = 1] = "Running";
  ProcessingStatus2[ProcessingStatus2["Stopped"] = 2] = "Stopped";
  return ProcessingStatus2;
})({});
var defaultOptions = {
  clock: {
    setTimeout: (fn, ms) => {
      return setTimeout(fn, ms);
    },
    clearTimeout: (id) => {
      return clearTimeout(id);
    }
  },
  logger: console.log.bind(console),
  devTools: false
};
var Actor = class {
  /**
   * Creates a new actor instance for the given logic with the provided options,
   * if any.
   *
   * @param logic The logic to create an actor from
   * @param options Actor options
   */
  constructor(logic, options) {
    this.logic = logic;
    this._snapshot = void 0;
    this.clock = void 0;
    this.options = void 0;
    this.id = void 0;
    this.mailbox = new Mailbox(this._process.bind(this));
    this.observers = /* @__PURE__ */ new Set();
    this.eventListeners = /* @__PURE__ */ new Map();
    this.logger = void 0;
    this._processingStatus = ProcessingStatus.NotStarted;
    this._parent = void 0;
    this._syncSnapshot = void 0;
    this.ref = void 0;
    this._actorScope = void 0;
    this.systemId = void 0;
    this.sessionId = void 0;
    this.system = void 0;
    this._doneEvent = void 0;
    this.src = void 0;
    this._deferred = [];
    const resolvedOptions = {
      ...defaultOptions,
      ...options
    };
    const {
      clock,
      logger,
      parent,
      syncSnapshot,
      id,
      systemId,
      inspect
    } = resolvedOptions;
    this.system = parent ? parent.system : createSystem(this, {
      clock,
      logger
    });
    if (inspect && !parent) {
      this.system.inspect(toObserver(inspect));
    }
    this.sessionId = this.system._bookId();
    this.id = id ?? this.sessionId;
    this.logger = options?.logger ?? this.system._logger;
    this.clock = options?.clock ?? this.system._clock;
    this._parent = parent;
    this._syncSnapshot = syncSnapshot;
    this.options = resolvedOptions;
    this.src = resolvedOptions.src ?? logic;
    this.ref = this;
    this._actorScope = {
      self: this,
      id: this.id,
      sessionId: this.sessionId,
      logger: this.logger,
      defer: (fn) => {
        this._deferred.push(fn);
      },
      system: this.system,
      stopChild: (child) => {
        if (child._parent !== this) {
          throw new Error(`Cannot stop child actor ${child.id} of ${this.id} because it is not a child`);
        }
        child._stop();
      },
      emit: (emittedEvent) => {
        const listeners = this.eventListeners.get(emittedEvent.type);
        const wildcardListener = this.eventListeners.get("*");
        if (!listeners && !wildcardListener) {
          return;
        }
        const allListeners = [...listeners ? listeners.values() : [], ...wildcardListener ? wildcardListener.values() : []];
        for (const handler of allListeners) {
          try {
            handler(emittedEvent);
          } catch (err) {
            reportUnhandledError(err);
          }
        }
      },
      actionExecutor: (action) => {
        const exec = () => {
          this._actorScope.system._sendInspectionEvent({
            type: "@xstate.action",
            actorRef: this,
            action: {
              type: action.type,
              params: action.params
            }
          });
          if (!action.exec) {
            return;
          }
          const saveExecutingCustomAction = executingCustomAction;
          try {
            executingCustomAction = true;
            action.exec(action.info, action.params);
          } finally {
            executingCustomAction = saveExecutingCustomAction;
          }
        };
        if (this._processingStatus === ProcessingStatus.Running) {
          exec();
        } else {
          this._deferred.push(exec);
        }
      }
    };
    this.send = this.send.bind(this);
    this.system._sendInspectionEvent({
      type: "@xstate.actor",
      actorRef: this
    });
    if (systemId) {
      this.systemId = systemId;
      this.system._set(systemId, this);
    }
    this._initState(options?.snapshot ?? options?.state);
    if (systemId && this._snapshot.status !== "active") {
      this.system._unregister(this);
    }
  }
  _initState(persistedState) {
    try {
      this._snapshot = persistedState ? this.logic.restoreSnapshot ? this.logic.restoreSnapshot(persistedState, this._actorScope) : persistedState : this.logic.getInitialSnapshot(this._actorScope, this.options?.input);
    } catch (err) {
      this._snapshot = {
        status: "error",
        output: void 0,
        error: err
      };
    }
  }
  update(snapshot, event) {
    this._snapshot = snapshot;
    let deferredFn;
    while (deferredFn = this._deferred.shift()) {
      try {
        deferredFn();
      } catch (err) {
        this._deferred.length = 0;
        this._snapshot = {
          ...snapshot,
          status: "error",
          error: err
        };
      }
    }
    switch (this._snapshot.status) {
      case "active":
        for (const observer of this.observers) {
          try {
            observer.next?.(snapshot);
          } catch (err) {
            reportUnhandledError(err);
          }
        }
        break;
      case "done":
        for (const observer of this.observers) {
          try {
            observer.next?.(snapshot);
          } catch (err) {
            reportUnhandledError(err);
          }
        }
        this._stopProcedure();
        this._complete();
        this._doneEvent = createDoneActorEvent(this.id, this._snapshot.output);
        if (this._parent) {
          this.system._relay(this, this._parent, this._doneEvent);
        }
        break;
      case "error":
        this._error(this._snapshot.error);
        break;
    }
    this.system._sendInspectionEvent({
      type: "@xstate.snapshot",
      actorRef: this,
      event,
      snapshot
    });
  }
  /**
   * Subscribe an observer to an actor’s snapshot values.
   *
   * @remarks
   * The observer will receive the actor’s snapshot value when it is emitted.
   * The observer can be:
   *
   * - A plain function that receives the latest snapshot, or
   * - An observer object whose `.next(snapshot)` method receives the latest
   *   snapshot
   *
   * @example
   *
   * ```ts
   * // Observer as a plain function
   * const subscription = actor.subscribe((snapshot) => {
   *   console.log(snapshot);
   * });
   * ```
   *
   * @example
   *
   * ```ts
   * // Observer as an object
   * const subscription = actor.subscribe({
   *   next(snapshot) {
   *     console.log(snapshot);
   *   },
   *   error(err) {
   *     // ...
   *   },
   *   complete() {
   *     // ...
   *   }
   * });
   * ```
   *
   * The return value of `actor.subscribe(observer)` is a subscription object
   * that has an `.unsubscribe()` method. You can call
   * `subscription.unsubscribe()` to unsubscribe the observer:
   *
   * @example
   *
   * ```ts
   * const subscription = actor.subscribe((snapshot) => {
   *   // ...
   * });
   *
   * // Unsubscribe the observer
   * subscription.unsubscribe();
   * ```
   *
   * When the actor is stopped, all of its observers will automatically be
   * unsubscribed.
   *
   * @param observer - Either a plain function that receives the latest
   *   snapshot, or an observer object whose `.next(snapshot)` method receives
   *   the latest snapshot
   */
  subscribe(nextListenerOrObserver, errorListener, completeListener) {
    const observer = toObserver(nextListenerOrObserver, errorListener, completeListener);
    if (this._processingStatus !== ProcessingStatus.Stopped) {
      this.observers.add(observer);
    } else {
      switch (this._snapshot.status) {
        case "done":
          try {
            observer.complete?.();
          } catch (err) {
            reportUnhandledError(err);
          }
          break;
        case "error": {
          const err = this._snapshot.error;
          if (!observer.error) {
            reportUnhandledError(err);
          } else {
            try {
              observer.error(err);
            } catch (err2) {
              reportUnhandledError(err2);
            }
          }
          break;
        }
      }
    }
    return {
      unsubscribe: () => {
        this.observers.delete(observer);
      }
    };
  }
  on(type, handler) {
    let listeners = this.eventListeners.get(type);
    if (!listeners) {
      listeners = /* @__PURE__ */ new Set();
      this.eventListeners.set(type, listeners);
    }
    const wrappedHandler = handler.bind(void 0);
    listeners.add(wrappedHandler);
    return {
      unsubscribe: () => {
        listeners.delete(wrappedHandler);
      }
    };
  }
  select(selector, equalityFn = Object.is) {
    return {
      subscribe: (observerOrFn) => {
        const observer = toObserver(observerOrFn);
        const snapshot = this.getSnapshot();
        let previousSelected = selector(snapshot);
        return this.subscribe((snapshot2) => {
          const nextSelected = selector(snapshot2);
          if (!equalityFn(previousSelected, nextSelected)) {
            previousSelected = nextSelected;
            observer.next?.(nextSelected);
          }
        });
      },
      get: () => selector(this.getSnapshot())
    };
  }
  /** Starts the Actor from the initial state */
  start() {
    if (this._processingStatus === ProcessingStatus.Running) {
      return this;
    }
    if (this._syncSnapshot) {
      this.subscribe({
        next: (snapshot) => {
          if (snapshot.status === "active") {
            this.system._relay(this, this._parent, {
              type: `xstate.snapshot.${this.id}`,
              snapshot
            });
          }
        },
        error: () => {
        }
      });
    }
    this.system._register(this.sessionId, this);
    if (this.systemId) {
      this.system._set(this.systemId, this);
    }
    this._processingStatus = ProcessingStatus.Running;
    const initEvent = createInitEvent(this.options.input);
    this.system._sendInspectionEvent({
      type: "@xstate.event",
      sourceRef: this._parent,
      actorRef: this,
      event: initEvent
    });
    const status = this._snapshot.status;
    switch (status) {
      case "done":
        this.update(this._snapshot, initEvent);
        return this;
      case "error":
        this._error(this._snapshot.error);
        return this;
    }
    if (!this._parent) {
      this.system.start();
    }
    if (this.logic.start) {
      try {
        this.logic.start(this._snapshot, this._actorScope);
      } catch (err) {
        this._snapshot = {
          ...this._snapshot,
          status: "error",
          error: err
        };
        this._error(err);
        return this;
      }
    }
    this.update(this._snapshot, initEvent);
    if (this.options.devTools) {
      this.attachDevTools();
    }
    this.mailbox.start();
    return this;
  }
  _process(event) {
    let nextState;
    let caughtError;
    try {
      nextState = this.logic.transition(this._snapshot, event, this._actorScope);
    } catch (err) {
      caughtError = {
        err
      };
    }
    if (caughtError) {
      const {
        err
      } = caughtError;
      this._snapshot = {
        ...this._snapshot,
        status: "error",
        error: err
      };
      this._error(err);
      return;
    }
    this.update(nextState, event);
    if (event.type === XSTATE_STOP) {
      this._stopProcedure();
      this._complete();
    }
  }
  _stop() {
    if (this._processingStatus === ProcessingStatus.Stopped) {
      return this;
    }
    this.mailbox.clear();
    if (this._processingStatus === ProcessingStatus.NotStarted) {
      this._processingStatus = ProcessingStatus.Stopped;
      return this;
    }
    this.mailbox.enqueue({
      type: XSTATE_STOP
    });
    return this;
  }
  /** Stops the Actor and unsubscribe all listeners. */
  stop() {
    if (this._parent) {
      throw new Error("A non-root actor cannot be stopped directly.");
    }
    return this._stop();
  }
  _complete() {
    for (const observer of this.observers) {
      try {
        observer.complete?.();
      } catch (err) {
        reportUnhandledError(err);
      }
    }
    this.observers.clear();
    this.eventListeners.clear();
  }
  _reportError(err) {
    if (!this.observers.size) {
      if (!this._parent) {
        reportUnhandledError(err);
      }
      this.eventListeners.clear();
      return;
    }
    let reportError = false;
    for (const observer of this.observers) {
      const errorListener = observer.error;
      reportError ||= !errorListener;
      try {
        errorListener?.(err);
      } catch (err2) {
        reportUnhandledError(err2);
      }
    }
    this.observers.clear();
    this.eventListeners.clear();
    if (reportError) {
      reportUnhandledError(err);
    }
  }
  _error(err) {
    this._stopProcedure();
    this._reportError(err);
    if (this._parent) {
      this.system._relay(this, this._parent, createErrorActorEvent(this.id, err));
    }
  }
  // TODO: atm children don't belong entirely to the actor so
  // in a way - it's not even super aware of them
  // so we can't stop them from here but we really should!
  // right now, they are being stopped within the machine's transition
  // but that could throw and leave us with "orphaned" active actors
  _stopProcedure() {
    if (this._processingStatus !== ProcessingStatus.Running) {
      return this;
    }
    this.system.scheduler.cancelAll(this);
    this.mailbox.clear();
    this.mailbox = new Mailbox(this._process.bind(this));
    this._processingStatus = ProcessingStatus.Stopped;
    this.system._unregister(this);
    return this;
  }
  /** @internal */
  _send(event) {
    if (this._processingStatus === ProcessingStatus.Stopped) {
      return;
    }
    this.mailbox.enqueue(event);
  }
  /**
   * Sends an event to the running Actor to trigger a transition.
   *
   * @param event The event to send
   */
  send(event) {
    this.system._relay(void 0, this, event);
  }
  attachDevTools() {
    const {
      devTools
    } = this.options;
    if (devTools) {
      const resolvedDevToolsAdapter = typeof devTools === "function" ? devTools : devToolsAdapter;
      resolvedDevToolsAdapter(this);
    }
  }
  toJSON() {
    return {
      xstate$$type: $$ACTOR_TYPE,
      id: this.id
    };
  }
  /**
   * Obtain the internal state of the actor, which can be persisted.
   *
   * @remarks
   * The internal state can be persisted from any actor, not only machines.
   *
   * Note that the persisted state is not the same as the snapshot from
   * {@link Actor.getSnapshot}. Persisted state represents the internal state of
   * the actor, while snapshots represent the actor's last emitted value.
   *
   * Can be restored with {@link ActorOptions.state}
   * @see https://stately.ai/docs/persistence
   */
  getPersistedSnapshot(options) {
    return this.logic.getPersistedSnapshot(this._snapshot, options);
  }
  [symbolObservable]() {
    return this;
  }
  /**
   * Read an actor’s snapshot synchronously.
   *
   * @remarks
   * The snapshot represent an actor's last emitted value.
   *
   * When an actor receives an event, its internal state may change. An actor
   * may emit a snapshot when a state transition occurs.
   *
   * Note that some actors, such as callback actors generated with
   * `fromCallback`, will not emit snapshots.
   * @see {@link Actor.subscribe} to subscribe to an actor’s snapshot values.
   * @see {@link Actor.getPersistedSnapshot} to persist the internal state of an actor (which is more than just a snapshot).
   */
  getSnapshot() {
    return this._snapshot;
  }
};
function createActor(logic, ...[options]) {
  return new Actor(logic, options);
}

// node_modules/xstate/dist/xstate-actors.esm.js
function fromTransition(transition, initialContext) {
  return {
    config: transition,
    transition: (snapshot, event, actorScope) => {
      return {
        ...snapshot,
        context: transition(snapshot.context, event, actorScope)
      };
    },
    getInitialSnapshot: (_, input) => {
      return {
        status: "active",
        output: void 0,
        error: void 0,
        context: typeof initialContext === "function" ? initialContext({
          input
        }) : initialContext
      };
    },
    getPersistedSnapshot: (snapshot) => snapshot,
    restoreSnapshot: (snapshot) => snapshot
  };
}
var XSTATE_PROMISE_RESOLVE = "xstate.promise.resolve";
var XSTATE_PROMISE_REJECT = "xstate.promise.reject";
var controllerMap = /* @__PURE__ */ new WeakMap();
function fromPromise(promiseCreator) {
  const logic = {
    config: promiseCreator,
    transition: (state, event, scope) => {
      if (state.status !== "active") {
        return state;
      }
      switch (event.type) {
        case XSTATE_PROMISE_RESOLVE: {
          const resolvedValue = event.data;
          return {
            ...state,
            status: "done",
            output: resolvedValue,
            input: void 0
          };
        }
        case XSTATE_PROMISE_REJECT:
          return {
            ...state,
            status: "error",
            error: event.data,
            input: void 0
          };
        case XSTATE_STOP: {
          controllerMap.get(scope.self)?.abort();
          controllerMap.delete(scope.self);
          return {
            ...state,
            status: "stopped",
            input: void 0
          };
        }
        default:
          return state;
      }
    },
    start: (state, {
      self: self2,
      system,
      emit
    }) => {
      if (state.status !== "active") {
        return;
      }
      const controller = new AbortController();
      controllerMap.set(self2, controller);
      const resolvedPromise = Promise.resolve(promiseCreator({
        input: state.input,
        system,
        self: self2,
        signal: controller.signal,
        emit
      }));
      resolvedPromise.then((response) => {
        if (self2.getSnapshot().status !== "active") {
          return;
        }
        controllerMap.delete(self2);
        system._relay(self2, self2, {
          type: XSTATE_PROMISE_RESOLVE,
          data: response
        });
      }, (errorData) => {
        if (self2.getSnapshot().status !== "active") {
          return;
        }
        controllerMap.delete(self2);
        system._relay(self2, self2, {
          type: XSTATE_PROMISE_REJECT,
          data: errorData
        });
      });
    },
    getInitialSnapshot: (_, input) => {
      return {
        status: "active",
        output: void 0,
        error: void 0,
        input
      };
    },
    getPersistedSnapshot: (snapshot) => snapshot,
    restoreSnapshot: (snapshot) => snapshot
  };
  return logic;
}
var emptyLogic = fromTransition((_) => void 0, void 0);

// node_modules/xstate/dist/xstate.esm.js
var defaultWaitForOptions = {
  timeout: Infinity
  // much more than 10 seconds
};
function waitFor(actorRef, predicate, options) {
  const resolvedOptions = {
    ...defaultWaitForOptions,
    ...options
  };
  return new Promise((res, rej) => {
    const {
      signal
    } = resolvedOptions;
    if (signal?.aborted) {
      rej(signal.reason);
      return;
    }
    let done = false;
    const handle = resolvedOptions.timeout === Infinity ? void 0 : setTimeout(() => {
      dispose();
      rej(new Error(`Timeout of ${resolvedOptions.timeout} ms exceeded`));
    }, resolvedOptions.timeout);
    const dispose = () => {
      clearTimeout(handle);
      done = true;
      sub?.unsubscribe();
      if (abortListener) {
        signal.removeEventListener("abort", abortListener);
      }
    };
    function checkEmitted(emitted) {
      if (predicate(emitted)) {
        dispose();
        res(emitted);
      }
    }
    let abortListener;
    let sub;
    checkEmitted(actorRef.getSnapshot());
    if (done) {
      return;
    }
    if (signal) {
      abortListener = () => {
        dispose();
        rej(signal.reason);
      };
      signal.addEventListener("abort", abortListener);
    }
    sub = actorRef.subscribe({
      next: checkEmitted,
      error: (err) => {
        dispose();
        rej(err);
      },
      complete: () => {
        dispose();
        rej(new Error(`Actor terminated without satisfying predicate`));
      }
    });
    if (done) {
      sub.unsubscribe();
    }
  });
}

// examples/reference-domain-app/packages/r41-kdp/src/workflow-execution.ts
function failed(code, message) {
  return { status: "FAILED", reason: { code, message } };
}
function reasonOf(outcome) {
  if (outcome.kind === "UNKNOWN") return outcome.unknownReason;
  if (outcome.kind === "FAILED") return outcome.failure;
  return { code: "DH_WORKFLOW_TERMINAL", message: "business terminal" };
}
function terminal(kind, current, original) {
  if (kind === "COMPLETE") return { status: "COMPLETE", value: current };
  if ("status" in original && original.status === kind) {
    return original;
  }
  if ("kind" in original && original.kind === kind) {
    return { status: kind, reason: reasonOf(original) };
  }
  return { status: kind, reason: { code: "DH_WORKFLOW_TERMINAL", message: "explicit business terminal" } };
}
function selectedKey(ref) {
  return canonicalJson(ref);
}
async function prepareDataInput(node, input, driver) {
  if (!node.data) return input;
  const bytes = await driver.read(node.data.resource);
  if (bytes.byteLength > node.data.maxBytes) {
    throw new Error("DH_WORKFLOW_READER_SIZE_LIMIT");
  }
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return { format: node.data.format, source };
}
async function invoke(driver, budget, ref, input) {
  if (budget.remainingCalls <= 0) {
    return { kind: "FAILED", failure: {
      code: "DH_WORKFLOW_CALL_BUDGET",
      message: "root Function call budget exhausted"
    } };
  }
  budget.remainingCalls -= 1;
  return driver.invoke(ref, input);
}
async function invokeLeaf(node, input, driver, budget) {
  if (!hasWorkflowCallBudget(budget.remainingCalls, node)) {
    return { kind: "FAILED", failure: {
      code: "DH_WORKFLOW_CALL_BUDGET",
      message: "insufficient budget before any leaf side effect"
    } };
  }
  let outcome = { kind: "FAILED", failure: {
    code: "DH_WORKFLOW_NO_FUNCTION",
    message: "selected leaf did not execute"
  } };
  let began = false;
  let fatal;
  try {
    if (node.hooks?.start) {
      began = true;
      const start = await invoke(driver, budget, node.hooks.start, input);
      if (start.kind !== "SUCCEEDED") {
        outcome = start;
      } else {
        outcome = await invoke(driver, budget, node.function, await prepareDataInput(node, input, driver));
      }
    } else {
      outcome = await invoke(driver, budget, node.function, await prepareDataInput(node, input, driver));
    }
  } catch (error) {
    fatal = error;
  } finally {
    if (node.hooks?.end && (began || !node.hooks.start)) {
      try {
        const end = await invoke(driver, budget, node.hooks.end, input);
        if (end.kind !== "SUCCEEDED" && outcome.kind !== "FAILED" && fatal === void 0) {
          outcome = end;
        }
      } catch (error) {
        if (fatal === void 0) fatal = error;
      }
    }
  }
  if (fatal !== void 0) {
    if (fatal instanceof Error) throw fatal;
    throw new Error("DH_WORKFLOW_FATAL");
  }
  return outcome;
}
async function executeDefinition(ref, input, driver, budget, ancestors, activeRefs, runChild) {
  const entry = driver.select(ref);
  if (!entry) return failed("DH_WORKFLOW_UNSELECTED", "child Workflow was not selected at BUILD");
  const key = selectedKey(ref);
  if (activeRefs.includes(key)) {
    return failed("DH_WORKFLOW_RECURSIVE", "Workflow recursively references an active ancestor");
  }
  const chain = [...ancestors, entry.definition];
  if (!withinWorkflowAncestorDepth(chain)) {
    return failed("DH_WORKFLOW_DEPTH_LIMIT", "per-Workflow descendant depth exceeded");
  }
  const nodes = new Map(entry.definition.nodes.map((node) => [node.id, node]));
  let current = entry.definition.entryNodeId;
  let value = input;
  while (true) {
    budget.remainingSteps -= 1;
    if (budget.remainingSteps < 0) {
      return failed("DH_WORKFLOW_STEP_LIMIT", "root WorkflowRun node transition limit reached");
    }
    const node = nodes.get(current);
    if (!node) return failed("DH_WORKFLOW_NODE_UNSELECTED", "selected graph missing a node");
    let result;
    if (node.kind === "workflow") {
      result = runChild ? await runChild(node.workflow, value, driver, budget, chain, [...activeRefs, key]) : await executeDefinition(node.workflow, value, driver, budget, chain, [...activeRefs, key]);
    } else {
      result = await invokeLeaf(node, value, driver, budget);
    }
    const label = "kind" in result ? functionOutcomeRouteLabel(result) : childWorkflowRouteLabel(result);
    const target = selectWorkflowTarget(node.switch.exits, label);
    if (target === null) {
      if ("kind" in result && result.kind === "UNKNOWN") {
        return { status: "UNKNOWN", reason: result.unknownReason };
      }
      if ("kind" in result && result.kind === "FAILED") {
        return { status: "FAILED", reason: result.failure };
      }
      if ("status" in result && result.status !== "COMPLETE") return result;
      return failed("DH_WORKFLOW_ROUTE_UNMATCHED", "no unique declared Switch exit for result");
    }
    const newValue = "kind" in result ? result.kind === "SUCCEEDED" ? result.value : value : result.status === "COMPLETE" ? result.value : value;
    if ("nodeId" in target) {
      current = target.nodeId;
      value = newValue;
      continue;
    }
    if (target.terminal === "COMPLETE" && ("kind" in result ? result.kind !== "SUCCEEDED" : result.status !== "COMPLETE")) {
      return failed("DH_WORKFLOW_INVALID_SUCCESS", "non-success cannot become COMPLETE");
    }
    return terminal(target.terminal, newValue, result);
  }
}

// examples/reference-domain-app/packages/r41-kdp/src/workflow-run.ts
async function startActor(run) {
  const logic = fromPromise(async ({ input }) => {
    const runChild = (ref, value, driver, budget, ancestors, activeRefs) => startActor({ ref, input: value, driver, budget, ancestors, activeRefs });
    return executeDefinition(
      input.ref,
      input.input,
      input.driver,
      input.budget,
      input.ancestors,
      input.activeRefs,
      runChild
    );
  });
  const actor = createActor(logic, { input: run });
  actor.start();
  try {
    const snapshot = await waitFor(actor, (current) => current.status === "done" || current.status === "error");
    if (snapshot.status === "error") throw snapshot.error;
    if (snapshot.output === void 0) throw new Error("DH_WORKFLOW_ACTOR_OUTPUT_MISSING");
    return snapshot.output;
  } finally {
    actor.stop();
  }
}
async function startWorkflowRun(rootRef, input, driver) {
  const root = driver.select(rootRef);
  if (!root) {
    return { status: "FAILED", reason: {
      code: "DH_WORKFLOW_UNSELECTED",
      message: "WorkflowRef not selected in sealed Lock"
    } };
  }
  const budget = {
    remainingCalls: root.definition.maxElementCalls,
    remainingSteps: Math.min(1e5, root.definition.maxElementCalls * 16)
  };
  return startActor({ ref: rootRef, input, driver, budget, ancestors: [], activeRefs: [] });
}

// examples/reference-domain-app/packages/r41-kdp/src/selected-function.ts
function failedOutcome(code, message) {
  return { kind: "FAILED", failure: { code, message } };
}
function unknownOutcome(code, message) {
  return { kind: "UNKNOWN", unknownReason: { code, message } };
}
function snapshotReason(value) {
  if (typeof value !== "object" || value === null) return null;
  const record = value;
  const code = record["code"];
  const message = record["message"];
  return typeof code === "string" && typeof message === "string" ? { code, message } : null;
}
function normalizeOutcome(raw, declaredOutcomes) {
  try {
    if (typeof raw === "object" && raw !== null) {
      const outcome = raw;
      const kind = outcome["kind"];
      if (kind === "SUCCEEDED" && hasOwn3(outcome, "value")) {
        const value = outcome["value"];
        if (!isPlainJsonValue(value)) {
          return failedOutcome("DH_RUNTIME_UNSUPPORTED_PROFILE", "implementation returned a non-JSON SUCCEEDED value");
        }
        if (!declaredOutcomes.includes("SUCCEEDED")) {
          return unknownOutcome("DH_RUNTIME_UNSUPPORTED_PROFILE", `contract did not declare outcome kind 'SUCCEEDED'`);
        }
        return { kind: "SUCCEEDED", value };
      }
      if (kind === "UNKNOWN" && hasOwn3(outcome, "unknownReason")) {
        const reason = snapshotReason(outcome["unknownReason"]);
        if (reason !== null) {
          if (!declaredOutcomes.includes("UNKNOWN")) {
            return unknownOutcome("DH_RUNTIME_UNSUPPORTED_PROFILE", `contract did not declare outcome kind 'UNKNOWN'`);
          }
          return { kind: "UNKNOWN", unknownReason: reason };
        }
      }
      if (kind === "FAILED" && hasOwn3(outcome, "failure")) {
        const reason = snapshotReason(outcome["failure"]);
        if (reason !== null) {
          if (!declaredOutcomes.includes("FAILED")) {
            return unknownOutcome("DH_RUNTIME_UNSUPPORTED_PROFILE", `contract did not declare outcome kind 'FAILED'`);
          }
          return { kind: "FAILED", failure: reason };
        }
      }
      if (typeof kind === "string" && (kind === "SUCCEEDED" || kind === "UNKNOWN" || kind === "FAILED")) {
        return unknownOutcome(
          "DH_RUNTIME_UNSUPPORTED_PROFILE",
          `implementation returned outcome kind '${kind}' missing its strict union payload`
        );
      }
      if (typeof kind === "string" && !declaredOutcomes.includes(kind)) {
        return unknownOutcome(
          "DH_RUNTIME_UNSUPPORTED_PROFILE",
          `implementation returned outcome kind '${kind}' that the contract did not declare`
        );
      }
    }
    return failedOutcome("DH_RUNTIME_UNSUPPORTED_PROFILE", "implementation returned a non-FunctionOutcome value");
  } catch {
    return failedOutcome(
      "DH_RUNTIME_UNSUPPORTED_PROFILE",
      "implementation result inspection raised an unhandled error (detail redacted)"
    );
  }
}
function hasOwn3(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function safeValidateJsonSubset(instance, schema) {
  try {
    return isPlainJsonValue(instance) && validateJsonSubset(instance, schema);
  } catch {
    return false;
  }
}

// examples/reference-domain-app/packages/r41-kdp/src/package-system.ts
var KdpLoadError = class extends Error {
  code;
  constructor(reason, code = "DH_KDP_PACKAGE_LOAD_FAILED") {
    super(reason);
    this.name = "KdpLoadError";
    this.code = code;
  }
};
var PackageSystem = class {
  constructor(installRoot, lock, hostPorts) {
    this.installRoot = installRoot;
    this.lock = lock;
    this.hostPorts = hostPorts;
  }
  installRoot;
  lock;
  hostPorts;
  moduleCache = /* @__PURE__ */ new Map();
  definitionCache = /* @__PURE__ */ new Map();
  schemaCache = /* @__PURE__ */ new Map();
  sealedHookTable = null;
  /** 记录每次真实进入 Init 的 Package，不合并相同调用者。 */
  initEvents = [];
  callerHistory = /* @__PURE__ */ new Map();
  exited = false;
  /** Host-only KDP Init 只能把当前激活转交给下一 Core 一次，不影响 Package 自主重复 Init。 */
  kernelHostEntered = false;
  kernelHostContinuationStarted = false;
  packageById(packageId) {
    return this.lock.selectedPackages.find((pkg) => pkg.packageId === packageId);
  }
  async importModule(absolutePath, what) {
    let cached = this.moduleCache.get(absolutePath);
    if (cached === void 0) {
      cached = import(pathToFileURL(absolutePath).href).then(
        (mod) => mod,
        (error) => {
          void error;
          throw new KdpLoadError(`${what} failed to import (untrusted module error redacted)`);
        }
      );
      this.moduleCache.set(absolutePath, cached);
    }
    return cached;
  }
  async readVerifiedBytes(packageId, path, expected, what) {
    const absolute = resolvePackageFile(this.installRoot, packageId, path);
    if (absolute === null) {
      throw new KdpLoadError(`${what} path '${packageId}/${path}' is not an in-package relative path`);
    }
    let bytes;
    try {
      bytes = await readFile2(absolute);
    } catch {
      throw new KdpLoadError(`${what} '${packageId}/${path}' is not readable`);
    }
    if (bytesContentDigest(bytes) !== expected) {
      throw new KdpLoadError(
        `${what} bytes at '${packageId}/${path}' do not match the sealed digest (post-install tamper refused)`,
        "DH_BOOT_PIN_MISMATCH"
      );
    }
    return bytes;
  }
  /**
   * 先检查 Package 主模块、已选 Function 和 Hook Provider 的真实字节，
   * 再允许任何模块被导入求值；相同资源出现冲突 digest 时直接拒绝。
   */
  async verifySelectedArtifacts() {
    const selected = /* @__PURE__ */ new Map();
    const collect = (ref) => {
      const key = `${ref.packageId}/${ref.path}`;
      const previous = selected.get(key);
      if (previous !== void 0 && previous.digest !== ref.digest) {
        throw new KdpLoadError(`inconsistent executable digests for '${key}'`, "DH_BOOT_PIN_MISMATCH");
      }
      selected.set(key, ref);
    };
    for (const pkg of this.lock.selectedPackages) collect(pkg.artifact);
    for (const fn of this.lock.selectedFunctions) collect(fn.implementation.module);
    for (const hook of this.lock.hookBindings) for (const provider of hook.providers) {
      const selected2 = this.functionByRef(provider);
      if (!selected2) throw new KdpLoadError("Hook provider not selected");
      collect(selected2.implementation.module);
    }
    for (const [key, digest] of Object.entries(this.lock.resourceDigests)) {
      if (!/\.(?:mjs|js)$/u.test(key) && !key.endsWith("/package.json")) continue;
      const split = splitResourceKey(key);
      if (split === null) throw new KdpLoadError(`invalid executable key '${key}'`);
      collect({ packageId: split.packageId, path: split.path, digest });
    }
    for (const [key, ref] of selected) {
      await this.readVerifiedBytes(ref.packageId, ref.path, ref.digest, `selected executable '${key}'`);
    }
  }
  async loadArtifactModule(ref, what) {
    const absolute = resolvePackageFile(this.installRoot, ref.packageId, ref.path);
    if (absolute === null) {
      throw new KdpLoadError(`${what} artifact path '${ref.packageId}/${ref.path}' is not an in-package relative path`);
    }
    await this.readVerifiedBytes(ref.packageId, ref.path, ref.digest, `${what} artifact`);
    return this.importModule(absolute, what);
  }
  async loadEntry(entry, what) {
    const mod = await this.loadArtifactModule(entry.module, what);
    const exported = mod[entry.exportName];
    if (exported === void 0) {
      throw new KdpLoadError(`${what} has no named export '${entry.exportName}'`);
    }
    return exported;
  }
  /** 获取本次激活中某个 Package 实际收到的 Init 调用来源，保留重复与先后顺序。 */
  initFrom(packageId) {
    if (this.packageById(packageId)?.recordInitFrom !== true) return void 0;
    return (this.callerHistory.get(packageId) ?? []).map((caller) => ({ ...caller }));
  }
  /**
   * KDP Host Init 一旦已被 Boot 真正调用，就立即登记真实进入历史。
   * 必须在进一步检查其它 Function/Hook/资源之前登记，保证后续任一失败都能尝试 KDP.Exit。
   * 这不是普通 Package.Init 去重器，不能用于吞掉 Extension 的多次调用。
   */
  recordSelectedKernelHostEntry() {
    if (this.kernelHostEntered) {
      throw new KdpLoadError("KDP Host Init has already entered this activation", "DH_RUNTIME_NOT_READY");
    }
    const rootId = this.lock.coreOrder[0];
    if (!rootId || this.lock.selectedKdpHost.kdpPackageId !== rootId) {
      throw new KdpLoadError("Host KDP identity does not match the selected Core.Order 0", "DH_BOOT_PIN_MISMATCH");
    }
    this.kernelHostEntered = true;
    this.initEvents.push(rootId);
    if (this.packageById(rootId)?.recordInitFrom === true) {
      const history = this.callerHistory.get(rootId) ?? [];
      history.push({ type: "Boot" });
      this.callerHistory.set(rootId, history);
    }
  }
  /**
   * 已进入的 Host Kernel 后半段：只执行其直系 Extension，然后进入下一个 Core。
   * 若调用者尚未先登记，则此方法先登记（供已有可信应用内调度复用）；
   * 真正 Host 激活入口必须提前在最初可清理边界登记。
   */
  async runRemainingCoresAfterKernelEntered(context) {
    if (this.kernelHostContinuationStarted) {
      throw new KdpLoadError("KDP Host continuation has already entered this activation", "DH_RUNTIME_NOT_READY");
    }
    if (!this.kernelHostEntered) this.recordSelectedKernelHostEntry();
    this.kernelHostContinuationStarted = true;
    return this.continueFromEnteredKernel(context);
  }
  async continueFromEnteredKernel(context) {
    const seen = /* @__PURE__ */ new Set();
    const businessResults = [];
    const completedCores = /* @__PURE__ */ new Set();
    const enter = async (packageId, caller, layer, nextCore) => {
      const pkg = this.packageById(packageId);
      if (!pkg) throw new KdpLoadError(`Init references unselected Package '${packageId}'`);
      if (pkg.layer !== layer && pkg.role !== "extension") {
        throw new KdpLoadError(`Core '${packageId}' is not in its declared Core.Order layer`);
      }
      if (seen.has(packageId)) throw new KdpLoadError(`recursive Init dependency cycle at '${packageId}'`);
      seen.add(packageId);
      try {
        this.initEvents.push(packageId);
        if (pkg.recordInitFrom === true) {
          const history = this.callerHistory.get(packageId) ?? [];
          history.push(caller);
          this.callerHistory.set(packageId, history);
        }
        const extensions = pkg.dependsOn.map((id) => this.packageById(id)).filter((dep) => dep?.role === "extension").sort((a, b) => a.packageId.localeCompare(b.packageId));
        for (const dep of extensions) {
          await enter(dep.packageId, { type: "Package", packageId }, dep.layer);
        }
        const initFunction = this.functionByRef(pkg.initFunction);
        if (!initFunction || canonicalJson(initFunction.ref.element) !== canonicalJson(pkg.init))
          throw new KdpLoadError(`Package '${packageId}' Init Element/Function identity mismatch`);
        const fn = await this.loadEntry(initFunction.implementation, `Init Element of '${packageId}'`);
        if (typeof fn !== "function") {
          throw new KdpLoadError(`Init Element of '${packageId}' is not a callable export`);
        }
        const resources = new Map(initFunction.resources.map((resource) => {
          const key = `${resource.packageId}/${resource.path}`;
          if (this.lock.resourceDigests[key] !== resource.digest) {
            throw new KdpLoadError(`Init resource '${key}' is not sealed`, "DH_BOOT_PIN_MISMATCH");
          }
          return [key, this.resourceHandle(key)];
        }));
        const allowedOwners = /* @__PURE__ */ new Set([packageId, ...pkg.dependsOn]);
        const explicitImports = new Set(pkg.imports.map((ref) => canonicalJson(ref)));
        const visibleFunctions = /* @__PURE__ */ new Map();
        for (const selected of this.lock.selectedFunctions) {
          const element = this.lock.selectedElements.find((candidate) => canonicalJson(candidate.ref) === canonicalJson(selected.ref.element));
          if (!element || !allowedOwners.has(element.ownerPackageId)) continue;
          if (element.ownerPackageId !== packageId && !explicitImports.has(canonicalJson(selected.ref))) continue;
          if (element.ownerPackageId !== packageId && element.visibility !== "public") continue;
          visibleFunctions.set(canonicalJson(selected.ref), Object.freeze({
            ref: structuredClone(selected.ref),
            invoke: (input) => this.invokeSelectedFunction(selected.ref, input)
          }));
        }
        const allowedWorkflowRoots = new Set((pkg.workflowRoots ?? []).map((ref) => canonicalJson(ref)));
        const workflows = pkg.workflowRoots?.length ? Object.freeze({
          start: async (ref, input) => {
            if (!allowedWorkflowRoots.has(canonicalJson(ref))) {
              return { status: "FAILED", reason: {
                code: "DH_WORKFLOW_UNSELECTED",
                message: "Package.Init may only start a BUILD-authorized Workflow root"
              } };
            }
            const selected = this.lock.selectedWorkflows?.find((item) => canonicalJson(item.ref) === canonicalJson(ref));
            if (!selected) {
              return { status: "FAILED", reason: {
                code: "DH_WORKFLOW_UNSELECTED",
                message: "authorized Workflow root is not selected in Lock"
              } };
            }
            return startWorkflowRun(ref, input, {
              select: (wanted) => this.lock.selectedWorkflows?.find((item) => canonicalJson(item.ref) === canonicalJson(wanted)),
              invoke: async (call, value) => {
                if (!this.functionByRef(call)) {
                  return { kind: "FAILED", failure: {
                    code: "DH_RUNTIME_FUNCTION_UNSELECTED",
                    message: "Workflow FunctionRef is not selected"
                  } };
                }
                return this.invokeSelectedFunction(call, value, { deferExitUntilWorkflowFinally: true });
              },
              read: async (data) => {
                const key = `${data.packageId}/${data.path}`;
                if (this.lock.resourceDigests[key] !== data.digest) {
                  throw new KdpLoadError("Workflow Reader resource does not match sealed Lock digest");
                }
                return this.resourceHandle(key).read();
              }
            });
          }
        }) : void 0;
        const kdpCore = pkg.role === "primary" && pkg.order === 0;
        const ownContext = {
          ...context,
          packageId,
          // 每个 Package 拿到独立的配置和句柄快照，不能修改后来者的 Init 上下文。
          config: structuredClone(context.config),
          functions: visibleFunctions,
          ...workflows ? { workflows } : {},
          ...pkg.recordInitFrom === true ? { InitFrom: Object.freeze((this.initFrom(packageId) ?? []).map((entry) => Object.freeze({ ...entry }))) } : {},
          hostPorts: kdpCore ? this.hostPorts : [],
          resources,
          ...nextCore !== void 0 ? { nextCore } : {}
        };
        try {
          const result = await fn(ownContext);
          if (pkg.role === "primary" && pkg.layer === "business") businessResults.push(result);
        } catch (error) {
          if (error instanceof KdpLoadError) throw error;
          throw new KdpLoadError(`Package '${packageId}' Init Element raised unhandled error (detail redacted)`, "DH_RUNTIME_NOT_READY");
        }
      } finally {
        seen.delete(packageId);
      }
    };
    const cores = this.lock.coreOrder;
    if (!cores.length) throw new KdpLoadError("Lock has no Core.Order chain");
    const rootId = cores[0];
    if (this.lock.selectedKdpHost.kdpPackageId !== rootId) {
      throw new KdpLoadError("Order 0 Core and selected Host KDP Package identities differ", "DH_BOOT_PIN_MISMATCH");
    }
    const coreBinding = (index, caller) => ({
      init: async () => {
        const id = cores[index];
        if (!id) return;
        const core = this.packageById(id);
        if (!core || core.role !== "primary") throw new KdpLoadError(`Core.Order references invalid Core '${id}'`);
        const next = cores[index + 1];
        const nextCore = next === void 0 ? void 0 : coreBinding(index + 1, { type: "Package", packageId: id });
        await enter(id, caller, core.layer, nextCore);
        completedCores.add(id);
      }
    });
    const kernel = this.packageById(rootId);
    if (!kernel || kernel.role !== "primary" || kernel.layer !== "kernel" || kernel.order !== 0) {
      throw new KdpLoadError("Host KDP must be the unique selected Kernel Core at Order 0");
    }
    const selectedInit = this.functionByRef(kernel.initFunction);
    if (!selectedInit || canonicalJson(selectedInit.ref.element) !== canonicalJson(kernel.init)) {
      throw new KdpLoadError("Host KDP Init Element/Function identity mismatch", "DH_BOOT_PIN_MISMATCH");
    }
    if (!this.kernelHostEntered) {
      throw new KdpLoadError("Selected Kernel Host Init is missing its entered record", "DH_RUNTIME_NOT_READY");
    }
    const directExtensions = kernel.dependsOn.map((id) => this.packageById(id)).filter((pkg) => pkg?.role === "extension").sort((a, b) => a.packageId.localeCompare(b.packageId));
    for (const extension of directExtensions) {
      await enter(extension.packageId, { type: "Package", packageId: rootId }, extension.layer);
    }
    completedCores.add(rootId);
    if (cores.length > 1) {
      await coreBinding(1, { type: "Package", packageId: rootId }).init();
    }
    const missing = cores.filter((id) => !completedCores.has(id));
    if (missing.length > 0) {
      throw new KdpLoadError(
        `Core.Order chain incomplete: missing Init for ${missing.join(", ")}`,
        "DH_RUNTIME_NOT_READY"
      );
    }
    return businessResults.length === 1 ? businessResults[0] : businessResults;
  }
  /**
   * Exit 仅在退出/未处理异常时执行：从最后进入 Init 的 Package 开始逆序清理。
   * 一次 Exit 抛错不能阻断其余清理；每一条 Init 进入记录都允许对应一次 Exit。
   */
  async runExit() {
    if (this.exited) return;
    this.exited = true;
    const failures = [];
    for (const packageId of [...this.initEvents].reverse()) {
      try {
        const pkg = this.packageById(packageId);
        if (!pkg) throw new KdpLoadError(`Exit references missing Package '${packageId}'`);
        if (!pkg.exit) continue;
        if (!pkg.exitFunction) throw new KdpLoadError(`Package '${packageId}' Exit missing FunctionRef`);
        const selectedExit = this.functionByRef(pkg.exitFunction);
        if (!selectedExit || canonicalJson(selectedExit.ref.element) !== canonicalJson(pkg.exit))
          throw new KdpLoadError(`Package '${packageId}' Exit Element/Function mismatch`);
        const fn = await this.loadEntry(selectedExit.implementation, `Exit Element of '${packageId}'`);
        if (typeof fn !== "function") throw new KdpLoadError(`Exit Element of '${packageId}' is not callable`);
        const exitContext = {
          packageId,
          ...pkg.recordInitFrom === true ? { InitFrom: this.initFrom(packageId) ?? [] } : {},
          hostPorts: pkg.role === "primary" && pkg.order === 0 ? this.hostPorts : []
        };
        await fn(exitContext);
      } catch {
        const reason = `${packageId}: Exit Element raised unhandled error (detail redacted)`;
        failures.push(reason);
        console.error(`[KDP Exit] code=DH_RUNTIME_EXIT_FAILED phase=exit package=${packageId}`);
      }
    }
    if (failures.length) {
      throw new KdpLoadError(`Exit failed for ${failures.length} Init call(s): ${failures.join("; ")}`);
    }
  }
  /** Hook Provider 必须是被选定模块的可调用导出；这里只固定表，不调用 Provider 本身。 */
  async sealHooks() {
    const table = /* @__PURE__ */ new Map();
    for (const binding of this.lock.hookBindings) {
      const providers = [];
      for (const provider of binding.providers) {
        const selected = this.functionByRef(provider);
        if (!selected) throw new KdpLoadError(`Hook '${binding.hookId}' missing selected FunctionRef`);
        const exported = await this.loadEntry(selected.implementation, `Hook '${binding.hookId}' provider`);
        if (typeof exported !== "function") throw new KdpLoadError(`Hook '${binding.hookId}' is not callable`);
        providers.push(exported);
      }
      table.set(`${binding.ownerPackageId}#${binding.hookId}`, Object.freeze(providers));
    }
    this.sealedHookTable = Object.freeze(table);
    return this.sealedHookTable;
  }
  get hooks() {
    return this.sealedHookTable ?? /* @__PURE__ */ new Map();
  }
  functionByRef(ref) {
    const wanted = canonicalJson(ref);
    return this.lock.selectedFunctions.find((fn) => canonicalJson(fn.ref) === wanted);
  }
  /** 可在 App READY 之前执行的最小已选 Function 运行器；不依赖 DomainApp.invoke。 */
  async invokeSelectedFunction(ref, input, options = {}) {
    const selected = this.functionByRef(ref);
    if (!selected) return { kind: "FAILED", failure: { code: "DH_RUNTIME_FUNCTION_UNSELECTED", message: "unselected FunctionRef" } };
    if (selected.invocationAbi === "kdp-host-init/1") {
      return { kind: "FAILED", failure: {
        code: "DH_RUNTIME_FUNCTION_UNSELECTED",
        message: "privileged Host Init cannot be invoked as a JSON Function"
      } };
    }
    if (selected.effects !== "none") return { kind: "FAILED", failure: { code: "DH_RUNTIME_UNSUPPORTED_PROFILE", message: "effectful Function not supported" } };
    const schemas = await this.functionSchemas(selected);
    if (schemas === null) return { kind: "UNKNOWN", unknownReason: { code: "DH_RUNTIME_UNSUPPORTED_PROFILE", message: "Function Schema unavailable" } };
    if (!safeValidateJsonSubset(input, schemas.input))
      return { kind: "FAILED", failure: { code: "DH_RUNTIME_INPUT_SCHEMA_MISMATCH", message: "Function input rejected by Schema" } };
    const implementation = await this.loadEntry(selected.implementation, `Function '${ref.functionId}'`);
    if (typeof implementation !== "function") throw new KdpLoadError("selected Function implementation is not callable");
    let raw;
    try {
      raw = await implementation(input);
    } catch {
      console.error(`[KDP Function] code=DH_KDP_PACKAGE_LOAD_FAILED function=${ref.functionId} detail=redacted`);
      if (options.deferExitUntilWorkflowFinally !== true) {
        try {
          await this.runExit();
        } catch {
          console.error("[KDP Exit] detail=redacted");
        }
      }
      throw new KdpLoadError("selected Function raised unhandled fatal exception (detail redacted)", "DH_RUNTIME_NOT_READY");
    }
    const outcome = normalizeOutcome(raw, selected.outcomes);
    if (outcome.kind === "SUCCEEDED" && !safeValidateJsonSubset(outcome.value, schemas.output))
      return { kind: "FAILED", failure: { code: "DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH", message: "Function output rejected by Schema" } };
    return outcome;
  }
  async findElementDefinition(definitionDigest) {
    const cached = this.definitionCache.get(definitionDigest);
    if (cached !== void 0) return cached;
    let found = null;
    for (const [key] of Object.entries(this.lock.resourceDigests)) {
      const split = splitResourceKey(key);
      if (split === null) continue;
      const absolute = resolvePackageFile(this.installRoot, split.packageId, split.path);
      if (absolute === null) continue;
      let parsed;
      try {
        parsed = JSON.parse(await readFile2(absolute, "utf8"));
      } catch {
        continue;
      }
      try {
        if (contentDigestOf(parsed) === definitionDigest) {
          found = parsed;
          break;
        }
      } catch {
        continue;
      }
    }
    this.definitionCache.set(definitionDigest, found);
    return found;
  }
  /**
   * 从 Lock 所属 Element 解析被选 Function 的输入/输出 Schema；
   * 外部 Schema 文件须位于已封存资源闭包并通过字节摘要验证。
   * 返回 null 表示资料不可用，上层转 UNKNOWN 而不是伪造成功。
   */
  async functionSchemas(fn) {
    const key = canonicalJson(fn.ref);
    const cached = this.schemaCache.get(key);
    if (cached !== void 0) return cached;
    let resolved = null;
    const element = this.lock.selectedElements.find(
      (candidate) => canonicalJson(candidate.ref) === canonicalJson(fn.ref.element)
    );
    if (element !== void 0) {
      const definition = await this.findElementDefinition(element.ref.digest);
      const contract = definition?.functions.find(
        (candidate) => candidate.id === fn.ref.functionId && candidate.contractVersion === fn.ref.contractVersion
      );
      if (definition !== null && contract !== void 0 && contract.invocationAbi !== "kdp-host-init/1") {
        const input = await this.resolveSchemaRef(contract.inputSchemaRef);
        const output = await this.resolveSchemaRef(contract.outputSchemaRef);
        if (input !== null && output !== null) resolved = { input, output };
      }
    }
    this.schemaCache.set(key, resolved);
    return resolved;
  }
  async resolveSchemaRef(schemaRef) {
    if (typeof schemaRef !== "object" || schemaRef === null) return null;
    const ref = schemaRef;
    if ("inline" in ref) return ref["inline"];
    const packageId = ref["packageId"];
    const path = ref["path"];
    if (typeof packageId !== "string" || typeof path !== "string") return null;
    const closureDigest = this.lock.resourceDigests[`${packageId}/${path}`];
    if (closureDigest === void 0) return null;
    const bytes = await this.readVerifiedBytes(packageId, path, closureDigest, "schema resource");
    try {
      return JSON.parse(bytes.toString("utf8"));
    } catch {
      return null;
    }
  }
  /** 句柄每次 read 仍做摘要验证；仅在 KDP 传入 AppInitContext 时按 SelectedFunction.resources 限权。 */
  resourceHandle(key) {
    const split = splitResourceKey(key);
    const packageId = split?.packageId ?? "";
    const path = split?.path ?? "";
    const ref = {
      packageId,
      path,
      digest: this.lock.resourceDigests[key] ?? "sha256:0"
    };
    return {
      ref,
      read: async () => {
        const expected = this.lock.resourceDigests[key];
        if (expected === void 0) {
          throw new KdpLoadError(`resource '${key}' is not part of the sealed closure`);
        }
        return this.readVerifiedBytes(packageId, path, expected, `resource '${key}'`);
      }
    };
  }
};

// examples/reference-domain-app/packages/r41-kdp/src/domain-app.ts
function createDomainApp(deps) {
  const { lock, packages } = deps;
  let disposeFlight = null;
  const inspect = () => Promise.resolve({
    appIdentity: { id: lock.appIdentity.id, version: lock.appIdentity.version, lockDigest: lock.closureDigest },
    target: { ...lock.target },
    packages: lock.selectedPackages.map((p) => ({
      packageId: p.packageId,
      version: p.version,
      layer: p.layer,
      role: p.role
    })),
    elements: lock.selectedElements.map((e) => ({
      ref: { ...e.ref },
      ownerPackageId: e.ownerPackageId,
      visibility: e.visibility
    })),
    // KDP Host Init 是进程内特权能力，不是可检查的普通领域 Function。
    functions: lock.selectedFunctions.filter((fn) => fn.invocationAbi !== "kdp-host-init/1").map((fn) => ({
      ref: { ...fn.ref, element: { ...fn.ref.element } },
      outcomes: [...fn.outcomes],
      effects: fn.effects
    }))
  });
  const dispose = () => {
    if (disposeFlight === null) {
      disposeFlight = packages.runExit().then(() => ({ status: "DISPOSED" }));
    }
    return disposeFlight;
  };
  return { get status() {
    return deps.initialStatus;
  }, inspect, dispose };
}

// examples/reference-domain-app/packages/r41-kdp/src/process-exit.ts
function installProcessExitHandoff(app, host = process, timeoutMs = 5e3) {
  let started = false;
  const registrations = [];
  const cleanup = () => {
    for (const { event, listener } of registrations) host.removeListener(event, listener);
  };
  const boundedDispose = async () => {
    let timer;
    try {
      return await Promise.race([
        app.dispose().then(
          () => ({ kind: "disposed" }),
          () => ({ kind: "failed" })
        ),
        new Promise((resolve3) => {
          timer = setTimeout(() => resolve3({ kind: "timeout" }), Math.max(1, timeoutMs));
        })
      ]);
    } finally {
      if (timer !== void 0) clearTimeout(timer);
    }
  };
  const start = async (event, exitCode) => {
    if (started) return;
    started = true;
    if (event === "uncaughtException" || event === "unhandledRejection") {
      console.error(`[KDP Process] code=DH_RUNTIME_UNCAUGHT phase=${event} detail=redacted`);
    } else if (event === "SIGINT" || event === "SIGTERM") {
      console.error(`[KDP Process] code=DH_RUNTIME_SIGNAL phase=${event}`);
    }
    const result = await boundedDispose();
    cleanup();
    if (result.kind === "timeout") {
      console.error("[KDP Process] code=DH_RUNTIME_EXIT_TIMEOUT phase=process-exit");
      host.exit(1);
      return;
    }
    if (result.kind === "failed") {
      console.error("[KDP Process] code=DH_RUNTIME_EXIT_FAILED phase=process-exit detail=redacted");
      host.exit(1);
      return;
    }
    host.exit(exitCode);
  };
  const register = (event, exitCode) => {
    const listener = () => {
      void start(event, exitCode);
    };
    registrations.push({ event, listener });
    host.once(event, listener);
  };
  register("beforeExit", 0);
  register("SIGINT", 0);
  register("SIGTERM", 0);
  register("uncaughtException", 1);
  register("unhandledRejection", 1);
  return {
    get status() {
      return app.status;
    },
    inspect: () => app.inspect(),
    dispose: () => {
      started = true;
      cleanup();
      return app.dispose();
    }
  };
}

// examples/reference-domain-app/packages/r41-kdp/src/kernel-lifecycle.ts
function sha256HexOf(bytes) {
  return createHash3("sha256").update(bytes).digest("hex");
}
function failed2(code, reason) {
  return { status: "FAILED", code, reason };
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function lifecycleEvents() {
  const owner = globalThis;
  return owner.__dhR41Events ??= [];
}
async function readDescriptorConfig(context, lock) {
  const fail = (reason) => ({
    ok: false,
    result: failed2("DH_KDP_PACKAGE_LOAD_FAILED", reason)
  });
  const descriptorPath = resolveInRoot(context.installRoot, context.descriptorPath);
  if (descriptorPath === null) {
    return {
      ok: false,
      result: failed2("DH_BOOT_PIN_MISMATCH", `context.descriptorPath '${context.descriptorPath}' is not an in-root relative path`)
    };
  }
  let bytes;
  try {
    bytes = await readFile3(descriptorPath);
  } catch {
    return fail(`Descriptor file '${context.descriptorPath}' is not readable`);
  }
  if (`sha256:${sha256HexOf(bytes)}` !== lock.appIdentity.descriptorDigest) {
    return fail("Descriptor bytes do not equal the Lock-pinned descriptorDigest");
  }
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return fail("Descriptor file is not parseable JSON");
  }
  if (!isRecord2(parsed)) {
    return fail("Descriptor file is not a JSON object");
  }
  const descriptor = parsed;
  const config = descriptor.config ?? {};
  if (!isRecord2(config) || !Object.values(config).every(isPlainJsonValue)) {
    return fail("Descriptor config is not a plain JSON object");
  }
  return { ok: true, config };
}
var APP_STATUSES = ["READY", "DEGRADED", "BLOCKED", "FAILED"];
function validateInitResult(result) {
  if (!isRecord2(result) || typeof result["status"] !== "string") return "Business Core.Init must return AppInitResult";
  if (!APP_STATUSES.includes(result["status"])) return "Business Core.Init status invalid";
  if ("detail" in result && result["detail"] !== void 0 && !isPlainJsonValue(result["detail"]))
    return "Business Core.Init detail invalid";
  return result["status"];
}
function validateBusinessCoreResults(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) throw new KdpLoadError("No Business Core.Init returned status", "DH_RUNTIME_NOT_READY");
  const statuses = list.map(validateInitResult);
  const invalid = statuses.find((status) => !APP_STATUSES.includes(status));
  if (invalid) throw new KdpLoadError(`Business Core.Init status refused: ${invalid}`, "DH_RUNTIME_NOT_READY");
  if (statuses.includes("FAILED")) throw new KdpLoadError("Business Core.Init reported FAILED", "DH_RUNTIME_NOT_READY");
  return { status: statuses.includes("BLOCKED") ? "BLOCKED" : statuses.includes("DEGRADED") ? "DEGRADED" : "READY" };
}
async function activateKernelLifecycle(context) {
  let trust;
  try {
    trust = await verifyInstallTrust(context);
  } catch {
    return failed2(
      "DH_KDP_PACKAGE_LOAD_FAILED",
      "KDP trusted installation verification threw (detail redacted); cleanup=CLEANUP_NOT_SAFE"
    );
  }
  if (!trust.ok) {
    return failed2(trust.failure.code, `${trust.failure.reason}; cleanup=CLEANUP_NOT_SAFE (untrusted install)`);
  }
  const { lock } = trust.value;
  const safeContext = trust.value.context;
  const packages = new PackageSystem(safeContext.installRoot, lock, safeContext.hostPorts);
  try {
    packages.recordSelectedKernelHostEntry();
    const hostFence = context[DH_KDP_HOST_EXIT_FENCE_KEY];
    hostFence?.registerExit(() => packages.runExit());
    lifecycleEvents().push({ phase: "init", packageId: lock.selectedKdpHost.kdpPackageId });
    const profile = lock.target.profile;
    if (profile !== NODE22_ESM_PROFILE) {
      throw new KdpLoadError(
        `Lock target profile '${profile}' is not the frozen '${NODE22_ESM_PROFILE}'`
      );
    }
    const [actualNodeMajor = 0, actualNodeMinor = 0] = process.versions.node.split(".").map(Number);
    if (actualNodeMajor < 22 || actualNodeMajor === 22 && actualNodeMinor < 12) {
      throw new KdpLoadError(
        `actual Node.js ${process.versions.node} is below the supported 22.12 runtime floor`,
        "DH_RUNTIME_UNSUPPORTED_PROFILE"
      );
    }
    const minimumNodeMajor = lock.target.nodeMajor ?? 22;
    if (safeContext.env.nodeMajor < minimumNodeMajor) {
      throw new KdpLoadError(
        `Host nodeMajor ${safeContext.env.nodeMajor} is below the Lock target floor ${minimumNodeMajor} for '${NODE22_ESM_PROFILE}'`,
        "DH_RUNTIME_UNSUPPORTED_PROFILE"
      );
    }
    const configResult = await readDescriptorConfig(safeContext, lock);
    if (!configResult.ok) {
      const failure = configResult.result;
      if (failure.status !== "FAILED") {
        throw new KdpLoadError("KDP descriptor configuration returned invalid failure result");
      }
      throw new KdpLoadError(failure.reason, failure.code);
    }
    const config = configResult.config;
    await packages.verifySelectedArtifacts();
    await packages.sealHooks();
    const initContext = {
      appId: lock.appIdentity.id,
      activationId: randomUUID(),
      lockDigest: lock.closureDigest,
      config,
      functions: /* @__PURE__ */ new Map(),
      resources: /* @__PURE__ */ new Map()
    };
    let rawInitResult;
    try {
      rawInitResult = await packages.runRemainingCoresAfterKernelEntered(initContext);
    } catch (error) {
      throw new KdpLoadError(
        error instanceof KdpLoadError ? error.message : "Core.Init raised an unhandled error (detail redacted)",
        "DH_RUNTIME_NOT_READY"
      );
    }
    const validated = validateBusinessCoreResults(rawInitResult);
    const app = createDomainApp({ lock, packages, initialStatus: validated.status });
    const exposedApp = safeContext.processLifecycle === void 0 ? app : installProcessExitHandoff(app, process, safeContext.processLifecycle.timeoutMs);
    return { status: "BOOTED", app: exposedApp };
  } catch (error) {
    let cleanupFailure = "";
    try {
      await packages.runExit();
    } catch {
      cleanupFailure = "; cleanup also failed (details redacted)";
    }
    const loadError = error instanceof KdpLoadError ? error : null;
    return failed2(
      loadError?.code ?? "DH_KDP_PACKAGE_LOAD_FAILED",
      `${loadError?.message ?? "Unexpected KDP failure (detail redacted)"}${cleanupFailure}`
    );
  }
}

// examples/reference-domain-app/packages/r41-kdp/src/index.ts
function lifecycleEvents2() {
  const owner = globalThis;
  return owner.__dhR41Events ??= [];
}
async function init(context) {
  return activateKernelLifecycle(context);
}
function exit(context) {
  lifecycleEvents2().push({ phase: "exit", packageId: context.packageId });
}
export {
  exit,
  init
};
