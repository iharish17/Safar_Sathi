const tteRoute = require('../routes/tte');
const mockPnrs = require('../data/mockPnrs');

const getPassengersForPnr = (pnr) => {
	const pnrData = mockPnrs[String(pnr || '')];
	if (Array.isArray(pnrData?.passengers) && pnrData.passengers.length > 0) {
		return pnrData.passengers;
	}

	return [
		{
			name: 'Passenger',
			age: '',
			gender: '',
			coach: '-',
			seat: '-',
			status: 'CNF',
		},
	];
};

module.exports = (io) => {
	io.on('connection', (socket) => {
		socket.on('tte_join', () => {
			// Reserved for future room segregation; currently all TTEs receive all updates.
		});

		socket.on('send_tte_request', (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			const nextRequest = {
				id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				status: 'Pending',
				timestamp: new Date().toISOString(),
				boardingStation: payload.boardingStation || payload.missedStation || 'N/A',
				missedStation: payload.missedStation || payload.boardingStation || 'N/A',
				catchStation: payload.catchStation || 'N/A',
				eta: payload.eta || '-',
				passengers: payload.passengers || getPassengersForPnr(payload.pnr),
				...payload,
			};

			requests.push(nextRequest);
			io.emit('new_request', nextRequest);
			io.emit('tte_request_received', nextRequest);
		});

		const approveRequest = (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			let approvedRequest = null;

			if (payload.id) {
				approvedRequest = requests.find((request) => request.id === payload.id) || null;
			}

			if (!approvedRequest && payload.pnr) {
				approvedRequest = requests.find((request) => request.pnr === payload.pnr) || null;
			}

			if (!approvedRequest) return;

			approvedRequest.status = 'Approved';
			approvedRequest.approvedAt = new Date().toISOString();

			io.emit('request_approved', {
				id: approvedRequest.id,
				pnr: approvedRequest.pnr,
			});

			io.emit('tte_request_updated', approvedRequest);
		};

		socket.on('approve_tte_request', approveRequest);
		socket.on('tte_approve', approveRequest);

		socket.on('tte_mark_present', (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			let presentRequest = null;
			if (payload.id) {
				presentRequest = requests.find((request) => request.id === payload.id) || null;
			}

			if (!presentRequest && payload.pnr) {
				presentRequest = requests.find((request) => request.pnr === payload.pnr) || null;
			}

			if (!presentRequest) return;

			presentRequest.status = 'Present';
			presentRequest.presentAt = new Date().toISOString();

			io.emit('request_marked_present', {
				id: presentRequest.id,
				pnr: presentRequest.pnr,
			});
			io.emit('tte_request_updated', presentRequest);
		});
	});
};
