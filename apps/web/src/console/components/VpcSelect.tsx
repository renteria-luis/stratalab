import Select from '@cloudscape-design/components/select';
import { useTopology } from '../../state/topologyStore';

/** The console's VPC picker: VPC IDs with their Name tag. */
export function VpcSelect({
  value,
  onChange,
  invalid,
}: {
  value: string | null;
  onChange: (vpcId: string | null) => void;
  invalid?: boolean;
}) {
  const topology = useTopology();
  const options = topology.vpcs.map((vpc) => ({
    value: vpc.id,
    label: vpc.id,
    description: vpc.name,
  }));
  return (
    <Select
      selectedOption={options.find((option) => option.value === value) ?? null}
      options={options}
      placeholder="Select a VPC"
      empty="No VPCs"
      invalid={invalid}
      onChange={({ detail }) => {
        onChange(detail.selectedOption.value ?? null);
      }}
    />
  );
}
