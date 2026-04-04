import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';

const TrainView = () => {
  const { trainNumber } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const focus = params.get('focus');

  return <Navigate to={`/search?train=${trainNumber}${focus ? `&focus=${focus}` : ''}`} replace />;
};

export default TrainView;
