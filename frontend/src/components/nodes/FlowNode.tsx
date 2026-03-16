import { Handle, Position } from 'reactflow'

interface FlowNodeData {
  label: string
  nodeType: 'process' | 'decision' | 'terminal' | string
  iconUrl?: string | null
  showIcon?: boolean
}

const SIDES = [
  { pos: Position.Top,    id: 'top'    },
  { pos: Position.Bottom, id: 'bottom' },
  { pos: Position.Left,   id: 'left'   },
  { pos: Position.Right,  id: 'right'  },
]

export default function FlowNode({ data }: { data: FlowNodeData }) {
  const type = data.nodeType
  const showIcon = data.showIcon !== false
  const hasIcon = showIcon && !!data.iconUrl

  return (
    <div className={`flow-node flow-node-${type}`}>
      {SIDES.map(({ pos, id }) => (
        <Handle key={id} type="source" position={pos} id={`${id}-s`} className="node-handle" style={{ opacity: 0 }} />
      ))}
      {SIDES.map(({ pos, id }) => (
        <Handle key={`t-${id}`} type="target" position={pos} id={`${id}-t`} className="node-handle" style={{ opacity: 0 }} />
      ))}

      {type === 'decision' ? (
        <div className="flow-node-diamond">
          <div className="flow-node-diamond-inner">
            {hasIcon && <img src={data.iconUrl!} alt="" className="flow-node-icon" />}
            <span className="flow-node-label">{data.label}</span>
          </div>
        </div>
      ) : (
        <div className="flow-node-content">
          {hasIcon && <img src={data.iconUrl!} alt="" className="flow-node-icon" />}
          <span className="flow-node-label">{data.label}</span>
        </div>
      )}
    </div>
  )
}
