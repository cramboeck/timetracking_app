import React, { useState } from 'react';
import ContractsList from './ContractsList';
import ContractDetail from './ContractDetail';
import { Contract } from '../services/api';

interface ContractsProps {
  onBack?: () => void;
}

const Contracts: React.FC<ContractsProps> = ({ onBack }) => {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  const handleSelectContract = (contract: Contract) => {
    setSelectedContractId(contract.id);
    setView('detail');
  };

  const handleCreateContract = () => {
    setSelectedContractId(null);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedContractId(null);
  };

  const handleSaved = () => {
    setView('list');
    setSelectedContractId(null);
  };

  if (view === 'detail') {
    return (
      <ContractDetail
        contractId={selectedContractId}
        onBack={handleBack}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <ContractsList
      onSelectContract={handleSelectContract}
      onCreateContract={handleCreateContract}
    />
  );
};

export default Contracts;
