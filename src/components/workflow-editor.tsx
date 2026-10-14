"use client";

import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  FileJson2,
  GitBranch,
  Inbox,
  LoaderCircle,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  starterWorkflow,
  workflowGraphSchema,
  workflowRunSchema,
  type DecisionNode,
  type OutcomeNode,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowRun,
} from "@/lib/workflow";

const STORAGE_KEY = "branchline.workflow.v1";

function serializeWorkflow(graph: WorkflowGraph, nodes: WorkflowNode[], edges: Edge[]) {
  return {
    title: graph.title,
    startNodeId: graph.startNodeId,
    nodes: nodes.map((node) =>
      node.type === "decision"
        ? {
            id: node.id,
            type: node.type,
            position: node.position,
            data: { title: node.data.title, prompt: node.data.prompt },
          }
        : {
            id: node.id,
            type: node.type,
            position: node.position,
            data: { title: node.data.title, description: node.data.description },
          },
    ),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      label: edge.label,
    })),
  };
}

function DecisionCard({ data, selected }: NodeProps<DecisionNode>) {
  return (
    <div className={`flow-node decision-node${selected ? " is-selected" : ""}${data.runStatus ? ` is-${data.runStatus}` : ""}`}>
      <Handle type="target" position={Position.Left} id="input" className="flow-handle input-handle" />
      <div className="node-topline node-drag-handle">
        <span className="node-icon"><Sparkles size={14} /></span>
        <span className="node-kicker">AI DECISION</span>
        <span className={`node-state${data.runStatus ? ` state-${data.runStatus}` : ""}`}>
          {data.runStatus === "active" ? <LoaderCircle size={12} className="spin" /> : null}
          {data.runStatus === "active" ? "RUNNING" : data.runStatus === "completed" ? data.result ?? "DONE" : data.runStatus === "failed" ? "ERROR" : "READY"}
        </span>
      </div>
      <div className="decision-title">{data.title}</div>
      <div className="decision-prompt">{data.prompt}</div>
      <div className="decision-footer"><span><Zap size={12} /> GPT · YES / NO</span><span className="node-dots">•••</span></div>
      <div className="decision-port port-yes"><span>YES</span><Handle type="source" position={Position.Right} id="yes" className="flow-handle yes-handle" /></div>
      <div className="decision-port port-no"><span>NO</span><Handle type="source" position={Position.Right} id="no" className="flow-handle no-handle" /></div>
    </div>
  );
}

function OutcomeCard({ data, selected }: NodeProps<OutcomeNode>) {
  return (
    <div className={`flow-node outcome-node${selected ? " is-selected" : ""}${data.runStatus ? " is-completed" : ""}`}>
      <Handle type="target" position={Position.Left} id="input" className="flow-handle input-handle" />
      <div className="node-topline node-drag-handle">
        <span className="outcome-icon"><Inbox size={14} /></span>
        <span className="node-kicker">OUTCOME</span>
        {data.runStatus ? <span className="node-state state-completed"><Check size={12} /> REACHED</span> : null}
      </div>
      <div className="decision-title">{data.title}</div>
      <div className="outcome-description">{data.description || "Workflow ends here."}</div>
      <div className="decision-footer"><span>END OF PATH</span><span className="node-dots">•••</span></div>
    </div>
  );
}

const nodeTypes = { decision: DecisionCard, outcome: OutcomeCard };

function makeNodeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function Editor() {
  const [graph, setGraph] = useState<WorkflowGraph>(starterWorkflow);
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>(starterWorkflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(starterWorkflow.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [run, setRun] = useState<WorkflowRun>();
  const [message, setMessage] = useState("Hi, I can't log in to my account and need help.");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const isRunning = run?.status === "queued" || run?.status === "running";
  const runId = run?.id;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = workflowGraphSchema.safeParse(JSON.parse(stored));
          if (parsed.success) {
            setGraph(parsed.data);
            setNodes(parsed.data.nodes);
            setEdges(parsed.data.edges);
          }
        }
      } catch {
        setError("Your saved workflow could not be loaded. The starter flow is ready.");
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(serializeWorkflow(graph, nodes, edges)),
        );
      } catch {
        setError("Could not save this workflow in browser storage.");
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [graph, nodes, edges, hydrated]);

  useEffect(() => {
    if (!isRunning || !runId) return;
    const poll = async () => {
      try {
        const response = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Could not retrieve workflow execution.");
        }
        const result = workflowRunSchema.safeParse(await response.json());
        if (!result.success) {
          throw new Error("The execution status response was invalid.");
        }
        setRun(result.data);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Could not update run status.");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 900);
    return () => window.clearInterval(timer);
  }, [isRunning, runId]);

  const nodesWithRunState = useMemo(() => {
    const lastLogs = new Map<string, WorkflowRun["logs"][number]>();
    for (const log of run?.logs ?? []) {
      if (log.nodeId) lastLogs.set(log.nodeId, log);
    }
    return nodes.map((node) => {
      const log = lastLogs.get(node.id);
      if (node.type === "decision") {
        const runStatus: DecisionNode["data"]["runStatus"] =
          run?.activeNodeId === node.id
            ? "active"
            : log?.status === "failed"
              ? "failed"
              : log?.status === "completed"
                ? "completed"
                : undefined;
        return {
          ...node,
          data: {
            ...node.data,
            runStatus,
            result: log?.result,
          },
        };
      }
      const runStatus: OutcomeNode["data"]["runStatus"] =
        log?.status === "completed" ? "completed" : undefined;
      return {
        ...node,
        data: { ...node.data, runStatus },
      };
    });
  }, [nodes, run]);

  const edgesWithRunState = useMemo(
    () =>
      edges.map((edge) => {
        const decision = run?.logs.find(
          (log) => log.nodeId === edge.source && log.status === "completed" && log.result,
        );
        const selected = decision?.result === edge.sourceHandle?.toUpperCase();
        return {
          ...edge,
          animated: selected,
          className: selected ? "flow-edge-selected" : "",
          style: { stroke: selected ? "#7c65dc" : "#cdd0dc", strokeWidth: selected ? 2.5 : 1.7 },
          markerEnd: { type: MarkerType.ArrowClosed, color: selected ? "#7c65dc" : "#cdd0dc" },
        };
      }),
    [edges, run],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.sourceHandle || !connection.target) return;
      if (connection.source === connection.target) {
        setError("A node cannot connect to itself.");
        return;
      }
      if (
        edges.some(
          (edge) => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle,
        )
      ) {
        setError(`The ${connection.sourceHandle.toUpperCase()} branch already has a connection.`);
        return;
      }
      setError("");
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: makeNodeId("branch"),
            type: "smoothstep",
            label: connection.sourceHandle!.toUpperCase(),
            labelStyle: { fill: "#697080", fontWeight: 700, fontSize: 10 },
            labelBgStyle: { fill: "#fff", fillOpacity: 0.95 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#cdd0dc" },
          },
          current,
        ),
      );
    },
    [edges, setEdges],
  );

  const addNode = (type: "decision" | "outcome") => {
    const id = makeNodeId(type);
    const position = { x: 330 + nodes.length * 28, y: 130 + nodes.length * 26 };
    const node: WorkflowNode =
      type === "decision"
        ? {
            id,
            type,
            position,
            data: { title: "New decision", prompt: "Write a yes-or-no question for the AI." },
          }
        : {
            id,
            type,
            position,
            data: { title: "New outcome", description: "Describe where this path should go." },
          };
    setNodes((current) => [...current, node]);
    if (type === "decision" && !graph.startNodeId) {
      setGraph((current) => ({ ...current, startNodeId: id }));
    }
    setSelectedNodeId(id);
    setError("");
  };

  const updateSelectedNode = (field: string, value: string) => {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== selectedNodeId) return node;
        if (node.type === "decision" && (field === "title" || field === "prompt")) {
          return { ...node, data: { ...node.data, [field]: value } };
        }
        if (node.type === "outcome" && (field === "title" || field === "description")) {
          return { ...node, data: { ...node.data, [field]: value } };
        }
        return node;
      }),
    );
  };

  const runWorkflow = async () => {
    setError("");
    if (message.trim().length === 0) {
      setError("Add a message for the AI to evaluate.");
      return;
    }
    const graphToRun = { ...graph, nodes, edges };
    const parsedGraph = workflowGraphSchema.safeParse(graphToRun);
    if (!parsedGraph.success) {
      setError("Check that every node has a title and a prompt or outcome description.");
      return;
    }
    if (!nodes.some((node) => node.id === parsedGraph.data.startNodeId && node.type === "decision")) {
      setError("The start decision is missing. Select a decision node as the start.");
      return;
    }
    setRun(undefined);
    try {
      const response = await fetch("/api/workflows/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: parsedGraph.data, input: message.trim() }),
      });
      const payload = (await response.json()) as { runId?: string; error?: string };
      if (!response.ok || !payload.runId) {
        throw new Error(payload.error ?? "Could not start the workflow.");
      }
      const now = new Date().toISOString();
      setRun({
        id: payload.runId,
        status: "queued",
        input: message.trim(),
        logs: [],
        createdAt: now,
        updatedAt: now,
      });
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Could not start the workflow.");
    }
  };

  const exportWorkflow = () => {
    const contents = JSON.stringify(serializeWorkflow(graph, nodes, edges), null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${graph.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "workflow"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importWorkflow = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = workflowGraphSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) {
        setError("That file is not a valid Branchline workflow JSON.");
        return;
      }
      setGraph(parsed.data);
      setNodes(parsed.data.nodes);
      setEdges(parsed.data.edges);
      setSelectedNodeId(undefined);
      setRun(undefined);
      setError("");
      window.requestAnimationFrame(() => void fitView({ padding: 0.24, duration: 350 }));
    } catch {
      setError("Could not read the workflow file. Check that it contains valid JSON.");
    }
  };

  const resetRun = () => {
    setRun(undefined);
    setError("");
  };

  return (
    <div className="workspace">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Branchline home">
          <span className="brand-mark"><GitBranch size={18} strokeWidth={2.4} /></span>
          <span>branchline<span className="brand-period">.</span></span>
        </Link>
        <div className="topbar-divider" />
        <div className="workflow-crumb">
          <span className="crumb-muted">WORKFLOWS</span>
          <span className="crumb-slash">/</span>
          <input
            aria-label="Workflow name"
            value={graph.title}
            maxLength={80}
            onChange={(event) => setGraph((current) => ({ ...current, title: event.target.value }))}
          />
        </div>
        <div className="topbar-spacer" />
        <span className="save-indicator"><span className="save-dot" />Saved locally</span>
        <button className="button button-quiet" onClick={() => importRef.current?.click()}><ArrowDownToLine size={15} /> Import</button>
        <button className="button button-quiet" onClick={exportWorkflow}><FileJson2 size={15} /> Export JSON</button>
        <button className="button button-run" onClick={() => void runWorkflow()} disabled={Boolean(isRunning)}>
          {isRunning ? <LoaderCircle size={15} className="spin" /> : <Play size={14} fill="currentColor" />}
          {isRunning ? "Running…" : "Run workflow"}
        </button>
        <input ref={importRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(event) => void importWorkflow(event)} />
      </header>

      <div className="editor-layout">
        <nav className="left-rail" aria-label="Workspace navigation">
          <button className="rail-button active" aria-label="Workflow editor"><Workflow size={18} /></button>
          <button className="rail-button" aria-label="Execution history" onClick={() => document.getElementById("execution-log")?.scrollIntoView({ behavior: "smooth" })}><Clock3 size={18} /></button>
          <div className="rail-spacer" />
          <div className="rail-avatar" aria-label="Workspace account">B</div>
        </nav>

        <main className="canvas-column">
          <div className="canvas-heading">
            <div>
              <div className="eyebrow">WORKFLOW BUILDER <span className="live-pill"><span /> DRAFT</span></div>
              <h1>{graph.title || "Untitled workflow"}</h1>
              <p>Connect decisions to build an intelligent path for every message.</p>
            </div>
            <div className="canvas-actions">
              <button className="button button-outline" onClick={() => addNode("outcome")}><Plus size={15} /> Add outcome</button>
              <button className="button button-primary" onClick={() => addNode("decision")}><Plus size={15} /> Add decision</button>
            </div>
          </div>

          <div className="canvas">
            <div className="canvas-label"><span className="canvas-label-icon"><GitBranch size={13} /></span> FLOW CANVAS <span className="canvas-label-count">{nodes.length} NODES</span></div>
            <div className="canvas-hint"><span className="hint-dot" /> Drag from a YES / NO port to connect a node</div>
            <ReactFlow
              nodes={nodesWithRunState}
              edges={edgesWithRunState}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(undefined)}
              onNodesDelete={(removed) => {
                if (removed.some((node) => node.id === selectedNodeId)) setSelectedNodeId(undefined);
                if (removed.some((node) => node.id === graph.startNodeId)) {
                  const next = nodes.find(
                    (node) =>
                      !removed.some((removedNode) => removedNode.id === node.id) &&
                      node.type === "decision",
                  );
                  setGraph((current) => ({ ...current, startNodeId: next?.id ?? "" }));
                }
              }}
              fitView
              fitViewOptions={{ padding: 0.24 }}
              minZoom={0.3}
              maxZoom={1.5}
              nodesDraggable
              nodesConnectable
              elementsSelectable
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background variant={BackgroundVariant.Dots} gap={23} size={1.3} color="#d8dbe5" />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
            {nodes.length === 0 ? (
              <div className="canvas-empty">
                <div className="empty-icon"><GitBranch size={19} /></div>
                <strong>Your canvas is ready</strong>
                <span>Add a decision, then connect its YES and NO branches.</span>
                <button className="button button-primary" onClick={() => addNode("decision")}><Plus size={15} /> Add your first decision</button>
              </div>
            ) : null}
            <div className="canvas-footer"><span><span className="footer-status-dot" /> All changes saved</span><span>{nodes.length} nodes <i /> {edges.length} connections</span></div>
          </div>
          <div className="canvas-bottom-note"><Sparkles size={13} /> Every decision runs as a durable, traceable Inngest step.</div>
        </main>

        <aside className="inspector">
          <div className="panel-section input-section">
            <div className="panel-heading">
              <div><span className="panel-icon purple"><Play size={13} /></span><h2>Test your flow</h2></div>
              <span className="beta-tag">LIVE</span>
            </div>
            <p className="panel-description">Send a message through your AI workflow.</p>
            <label className="field-label" htmlFor="test-message">MESSAGE TO CLASSIFY</label>
            <textarea id="test-message" className="test-input" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} placeholder="Type a message for the AI to evaluate…" />
            <button className="button button-run run-full" onClick={() => void runWorkflow()} disabled={Boolean(isRunning)}>
              {isRunning ? <LoaderCircle size={15} className="spin" /> : <Play size={14} fill="currentColor" />}
              {isRunning ? "Running workflow…" : "Run workflow"} {!isRunning ? <ArrowRight size={14} className="button-trailing" /> : null}
            </button>
            <div className="run-caption"><Zap size={12} /> Powered by Inngest + OpenAI</div>
          </div>

          <div className="panel-section node-inspector">
            <div className="section-title"><span className="section-heading">{selectedNode ? "NODE SETTINGS" : "WORKFLOW OVERVIEW"}</span>{selectedNode ? <button className="plain-icon" onClick={() => setSelectedNodeId(undefined)} aria-label="Close node settings"><X size={15} /></button> : null}</div>
            {selectedNode ? (
              <>
                <label className="field-label" htmlFor="node-title">NODE NAME</label>
                <input id="node-title" className="text-input" value={selectedNode.data.title} maxLength={80} onChange={(event) => updateSelectedNode("title", event.target.value)} />
                {selectedNode.type === "decision" ? (
                  <>
                    {graph.startNodeId === selectedNode.id ? (
                      <div className="start-node-badge"><Check size={12} /> STARTING DECISION</div>
                    ) : (
                      <button className="set-start-node" onClick={() => setGraph((current) => ({ ...current, startNodeId: selectedNode.id }))}>Set as starting decision</button>
                    )}
                    <label className="field-label field-label-spaced" htmlFor="node-prompt">DECISION PROMPT</label>
                    <textarea id="node-prompt" className="prompt-input" value={selectedNode.data.prompt} maxLength={2000} onChange={(event) => updateSelectedNode("prompt", event.target.value)} placeholder="Ask a question that can be answered yes or no." />
                    <div className="field-helper">The AI will respond with exactly YES or NO.</div>
                  </>
                ) : (
                  <>
                    <label className="field-label field-label-spaced" htmlFor="node-description">DESTINATION</label>
                    <textarea id="node-description" className="prompt-input short" value={selectedNode.data.description} maxLength={240} onChange={(event) => updateSelectedNode("description", event.target.value)} placeholder="Describe this outcome." />
                  </>
                )}
                <button className="delete-node" onClick={() => {
                  setNodes((current) => current.filter((node) => node.id !== selectedNode.id));
                  setEdges((current) => current.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
                  if (graph.startNodeId === selectedNode.id) {
                    const next = nodes.find((node) => node.id !== selectedNode.id && node.type === "decision");
                    setGraph((current) => ({ ...current, startNodeId: next?.id ?? "" }));
                  }
                  setSelectedNodeId(undefined);
                }}><X size={13} /> Delete node</button>
              </>
            ) : (
              <div className="overview-grid">
                <div><span>DECISION NODES</span><strong>{nodes.filter((node) => node.type === "decision").length.toString().padStart(2, "0")}</strong></div>
                <div><span>OUTCOMES</span><strong>{nodes.filter((node) => node.type === "outcome").length.toString().padStart(2, "0")}</strong></div>
                <div><span>CONNECTIONS</span><strong>{edges.length.toString().padStart(2, "0")}</strong></div>
                <div><span>EXECUTION</span><strong className="overview-ready"><span /> Ready</strong></div>
              </div>
            )}
          </div>

          <div className="execution-section" id="execution-log">
            <div className="execution-heading">
              <div><span className="panel-icon mint"><Zap size={13} /></span><h2>Execution log</h2></div>
              {run ? <button className="plain-icon" onClick={resetRun} aria-label="Clear execution log"><RotateCcw size={14} /></button> : <span className="log-count">0</span>}
            </div>
            {!run ? (
              <div className="log-empty"><span className="log-empty-icon"><Clock3 size={15} /></span><strong>No runs yet</strong><span>Run your workflow to see each decision as it happens.</span></div>
            ) : (
              <div className="run-log">
                <div className="run-meta"><span className={`run-badge run-${run.status}`}>{run.status === "running" || run.status === "queued" ? <LoaderCircle size={11} className="spin" /> : run.status === "failed" ? <CircleAlert size={11} /> : <Check size={11} />}{run.status}</span><span>{new Date(run.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
                <div className="run-message"><span className="message-dot" />{run.input}</div>
                {run.logs.map((log) => (
                  <div className={`log-entry log-${log.status}`} key={log.id}>
                    <div className="log-entry-icon">{log.status === "running" ? <LoaderCircle size={13} className="spin" /> : log.status === "failed" ? <CircleAlert size={13} /> : <Check size={13} />}</div>
                    <div className="log-entry-copy">
                      {log.nodeTitle ? <strong>{log.nodeTitle}{log.result ? <span className={`result-pill result-${log.result.toLowerCase()}`}>{log.result}</span> : null}</strong> : null}
                      <span>{log.message}</span>
                      <time>{new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                    </div>
                  </div>
                ))}
                {run.error ? <div className="run-error"><CircleAlert size={14} /><span>{run.error}</span></div> : null}
              </div>
            )}
          </div>
          <div className="panel-bottom"><span className="bottom-check"><Check size={11} /></span> Your workflow is saved in this browser</div>
        </aside>
      </div>
      {error ? <div className="toast-error" role="alert"><CircleAlert size={15} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div> : null}
    </div>
  );
}

export default function WorkflowEditor() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
