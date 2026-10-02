namespace BookReader.Api.Models;

public class SavedWord
{
    public int Id { get; set; }

    public int BookId { get; set; }

    public required string Original { get; set; }

    public required string Translation { get; set; }

    public DateTime CreatedAt { get; set; }

    public Book? Book { get; set; }
}
