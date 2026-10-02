namespace BookReader.Api.DTOs;

public sealed record SavedWordResponse(int Id, int BookId, string Original, string Translation, DateTime CreatedAt);
