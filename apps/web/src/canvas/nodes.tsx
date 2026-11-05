import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { CanvasNodeKind } from './layout';

// A type alias, not an interface: React Flow node data must be assignable to
// Record<string, unknown>, which interfaces without an index signature are not.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type DiagramNodeData = {
  readonly kind: CanvasNodeKind;
  readonly icon: string;
  readonly title: string;
  readonly lines: readonly string[];
  /** The trace stopped at this node: dashed outline, icon and text, not color alone. */
  readonly failedText?: string;
};

export type DiagramNode = Node<DiagramNodeData, 'resource'>;

/** One diagram node: an icon and real DOM text (AGENTS.md, UI rules). */
export function ResourceNode({ data }: NodeProps<DiagramNode>) {
  const group = data.kind === 'vpc' || data.kind === 'subnet';
  return (
    <div
      className={`sim-node sim-node--${data.kind}${group ? ' sim-node--group' : ''}${
        data.failedText === undefined ? '' : ' sim-node--failed'
      }`}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="sim-node__header">
        <img
          className="sim-node__icon"
          src={data.icon}
          alt=""
          width={group ? 24 : 32}
          height={group ? 24 : 32}
        />
        <div className="sim-node__text">
          <strong className="sim-node__title">{data.title}</strong>
          {data.lines.map((line) => (
            <span key={line} className="sim-node__line">
              {line}
            </span>
          ))}
        </div>
      </div>
      {data.failedText !== undefined && (
        <span className="sim-node__failed" role="status">
          <span aria-hidden="true">✕</span> {data.failedText}
        </span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

export const NODE_TYPES = { resource: ResourceNode };
