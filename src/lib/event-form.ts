/** What the event form posts: dates and times as a clock in TIMEZONE shows them. */
export type EventFields = {
	title: string;
	location: string;
	startDate: string;
	startTime: string;
	endDate: string;
	endTime: string;
};

export type EventFieldError = 'required' | 'invalid' | 'before_start';
export type EventFieldErrors = Partial<Record<'title' | 'start' | 'end', EventFieldError>>;
