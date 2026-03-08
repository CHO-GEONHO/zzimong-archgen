import { Handle, Position } from 'reactflow'

interface InfraNodeData {
  label: string
  sublabel?: string
  icon?: string | null
  ip?: string
  port?: string
  tags?: string[]
  nodeType?: string
}

export default function InfraNode({ data }: { data: InfraNodeData }) {
  return (
    <div className="infra-node">
      <Handle type="target" position={Position.Left} />

      <div className="infra-node-content">
        {data.icon ? (
          <img
            src={data.icon}
            className="node-icon"
            width={40}
            height={40}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="node-icon-placeholder">
            {data.nodeType?.[0]?.toUpperCase() || '?'}
          </div>
        )}

        <div className="node-labels">
          <div className="node-label">{data.label}</div>
          {data.sublabel && <div className="node-sublabel">{data.sublabel}</div>}
          {data.ip && <div className="node-badge ip">{data.ip}</div>}
          {data.port && <div className="node-badge port">:{data.port}</div>}
        </div>
      </div>

      {data.tags?.includes('spot_instance') && (
        <span className="node-tag spot">Spot</span>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  )
}
