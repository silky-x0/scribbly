
export class Player {
  score = 0;
  isReady = false;
  hasGuessed = false;
  isConnected = true;

  constructor(
    public id: string,
    public name: string,
    public isHost = false,
  ) {}
}
