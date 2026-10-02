namespace BookReader.Api.Models;

public class Book
{
    public int Id { get; set; }

    public required string Name { get; set; }

    public ICollection<SavedWord> SavedWords { get; } = new List<SavedWord>();
}
