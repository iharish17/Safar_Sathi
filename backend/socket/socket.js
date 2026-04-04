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
	const findRequest = (requests, payload = {}, options = {}) => {
		if (!Array.isArray(requests) || requests.length === 0) return null;
		const { pendingOnly = false } = options;

		const isAllowedStatus = (request) => {
			if (!pendingOnly) return true;
			return String(request?.status || '').toLowerCase() === 'pending';
		};

		if (payload.id) {
			const byId = requests.find((request) => request.id === payload.id) || null;
			if (byId && isAllowedStatus(byId)) return byId;
		}

		const payloadPnr = String(payload.pnr || '').trim();
		if (!payloadPnr) return null;

		const payloadBoarding = String(payload.boardingStation || payload.missedStation || '').trim().toUpperCase();
		for (let i = requests.length - 1; i >= 0; i -= 1) {
			const request = requests[i];
			if (String(request?.pnr || '').trim() !== payloadPnr) continue;
			if (!isAllowedStatus(request)) continue;

			if (!payloadBoarding) return request;
			const requestBoarding = String(request?.boardingStation || request?.missedStation || '').trim().toUpperCase();
			if (requestBoarding === payloadBoarding) return request;
		}

		return null;
	};

	io.on('connection', (socket) => {
		socket.on('tte_join', () => {
			// Reserved for future room segregation; currently all TTEs receive all updates.
		});

		socket.on('send_tte_request', (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;
			const now = new Date().toISOString();

			const nextRequest = {
				id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				status: 'Pending',
				timestamp: now,
				boardingStation: payload.boardingStation || payload.missedStation || 'N/A',
				missedStation: payload.missedStation || payload.boardingStation || 'N/A',
				catchStation: payload.catchStation || 'N/A',
				eta: payload.eta || '-',
				passengers: payload.passengers || getPassengersForPnr(payload.pnr),
				changeLog: [
					{
						timestamp: now,
						action: 'created',
						actor: 'passenger',
						message: payload.message || '',
					},
				],
				...payload,
			};

			requests.push(nextRequest);
			io.emit('new_request', nextRequest);
			io.emit('tte_request_received', nextRequest);
		});

		const approveRequest = (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			const approvedRequest = findRequest(requests, payload, { pendingOnly: true });

			if (!approvedRequest) return;

			approvedRequest.status = 'Approved';
			approvedRequest.approvedAt = new Date().toISOString();
			approvedRequest.changeLog = [
				...(Array.isArray(approvedRequest.changeLog) ? approvedRequest.changeLog : []),
				{
					timestamp: approvedRequest.approvedAt,
					action: 'approved',
					actor: 'tte',
				},
			];

			io.emit('request_approved', {
				id: approvedRequest.id,
				pnr: approvedRequest.pnr,
				boardingStation: approvedRequest.boardingStation || approvedRequest.missedStation || 'N/A',
				missedStation: approvedRequest.missedStation || approvedRequest.boardingStation || 'N/A',
			});

			io.emit('tte_request_updated', approvedRequest);
		};

		socket.on('approve_tte_request', approveRequest);
		socket.on('tte_approve', approveRequest);

		const rejectRequest = (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			const rejectedRequest = findRequest(requests, payload, { pendingOnly: true });

			if (!rejectedRequest) return;

			rejectedRequest.status = 'Rejected';
			rejectedRequest.rejectedAt = new Date().toISOString();
			rejectedRequest.changeLog = [
				...(Array.isArray(rejectedRequest.changeLog) ? rejectedRequest.changeLog : []),
				{
					timestamp: rejectedRequest.rejectedAt,
					action: 'rejected',
					actor: 'tte',
				},
			];

			io.emit('request_rejected', {
				id: rejectedRequest.id,
				pnr: rejectedRequest.pnr,
				boardingStation: rejectedRequest.boardingStation || rejectedRequest.missedStation || 'N/A',
				missedStation: rejectedRequest.missedStation || rejectedRequest.boardingStation || 'N/A',
			});

			io.emit('tte_request_updated', rejectedRequest);
		};

		socket.on('reject_tte_request', rejectRequest);
		socket.on('tte_reject', rejectRequest);

		socket.on('update_tte_request', (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			const editableRequest = findRequest(requests, payload, { pendingOnly: true });
			if (!editableRequest) return;

			const prevMessage = editableRequest.message || '';
			const nextMessage = String(payload.message || '').trim();
			editableRequest.message = nextMessage;
			editableRequest.updatedAt = new Date().toISOString();
			editableRequest.changeLog = [
				...(Array.isArray(editableRequest.changeLog) ? editableRequest.changeLog : []),
				{
					timestamp: editableRequest.updatedAt,
					action: 'updated',
					actor: 'passenger',
					previousMessage: prevMessage,
					message: nextMessage,
				},
			];

			io.emit('tte_request_updated', editableRequest);
		});

		socket.on('cancel_tte_request', (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			const cancellableRequest = findRequest(requests, payload, { pendingOnly: true });
			if (!cancellableRequest) return;

			cancellableRequest.status = 'Cancelled';
			cancellableRequest.cancelledAt = new Date().toISOString();
			cancellableRequest.changeLog = [
				...(Array.isArray(cancellableRequest.changeLog) ? cancellableRequest.changeLog : []),
				{
					timestamp: cancellableRequest.cancelledAt,
					action: 'cancelled',
					actor: 'passenger',
				},
			];

			io.emit('request_cancelled', {
				id: cancellableRequest.id,
				pnr: cancellableRequest.pnr,
				boardingStation: cancellableRequest.boardingStation || cancellableRequest.missedStation || 'N/A',
				missedStation: cancellableRequest.missedStation || cancellableRequest.boardingStation || 'N/A',
			});
			io.emit('tte_request_updated', cancellableRequest);
		});

		socket.on('tte_mark_present', (payload = {}) => {
			const requests = tteRoute.getTteRequests?.();
			if (!Array.isArray(requests)) return;

			const presentRequest = findRequest(requests, payload);

			if (!presentRequest) return;

			presentRequest.status = 'Present';
			presentRequest.presentAt = new Date().toISOString();

			io.emit('request_marked_present', {
				id: presentRequest.id,
				pnr: presentRequest.pnr,
				boardingStation: presentRequest.boardingStation || presentRequest.missedStation || 'N/A',
				missedStation: presentRequest.missedStation || presentRequest.boardingStation || 'N/A',
			});
			io.emit('tte_request_updated', presentRequest);
		});
	});
};
