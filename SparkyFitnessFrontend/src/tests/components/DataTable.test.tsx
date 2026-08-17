import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { renderWithClient } from '@/tests/test-utils';

jest.mock('@/components/ui/DataTablePagination', () => ({
  DataTablePagination: () => <div data-testid="pagination" />,
}));

interface TestRow {
  id: string;
  name: string;
}

const columns: ColumnDef<TestRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: () => <button type="button">Edit</button>,
  },
];

describe('DataTable', () => {
  it('opens row details on row click but ignores interactive controls', () => {
    const handleRowClick = jest.fn();

    renderWithClient(
      <DataTable
        columns={columns}
        data={[{ id: 'row-1', name: 'Bench Press' }]}
        onRowClick={handleRowClick}
      />
    );

    const titleCell = screen.getAllByText('Bench Press')[0];
    if (!titleCell) {
      throw new Error('Expected table row title to be rendered');
    }

    fireEvent.click(titleCell);
    expect(handleRowClick).toHaveBeenCalledWith({
      id: 'row-1',
      name: 'Bench Press',
    });

    handleRowClick.mockClear();
    const editButton = screen.getAllByRole('button', { name: 'Edit' })[0];
    if (!editButton) {
      throw new Error('Expected row action button to be rendered');
    }

    fireEvent.click(editButton);
    expect(handleRowClick).not.toHaveBeenCalled();
  });
});
