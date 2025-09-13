export interface DailyNote {
    id: string;
    title: string;
    date: Date;
    content: string;
}

export interface DailyNoteDeleteResponse {
    success: boolean;
    message?: string;
}

export interface DailyNoteService {
    getAllNotes(): Promise<DailyNote[]>;
    getNoteById(id: string): Promise<DailyNote | null>;
    deleteNoteById(id: string): Promise<DailyNoteDeleteResponse>;
}