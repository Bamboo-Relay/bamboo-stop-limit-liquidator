export interface NetworkService {
    start(): Promise<boolean>;
    stop(): Promise<boolean>;
}
