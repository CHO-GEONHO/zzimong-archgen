interface GroupNodeData {
  label: string
  cloud?: string
  region?: string
  color?: string
}

export default function GroupNode({ data }: { data: GroupNodeData }) {
  return (
    <div className="group-node-header">
      <div className="group-cloud-indicator" style={{ background: data.color || '#888' }} />
      <span className="group-label">{data.label}</span>
      {data.region && <span className="group-region">{data.region}</span>}
    </div>
  )
}
